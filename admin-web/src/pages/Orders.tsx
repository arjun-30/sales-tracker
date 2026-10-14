import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { api } from "../lib/api";
import { displayProductName, formatDate, formatINR, formatTime } from "../lib/format";
import type { District, Order, OrderStatus } from "../lib/types";
import { Card, Notice, OrderStatusLabel, PageHeader, Tabs } from "../components/ui/Card";
import { Input, Select } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { MessageRow, Table, Td, Th, Tr } from "../components/ui/Table";

// Mirrors ALLOWED_TRANSITIONS in server/src/routes/orders.routes.ts; the server enforces it.
const actionsByStatus: Record<OrderStatus, { to: OrderStatus; label: string }[]> = {
  pending: [
    { to: "confirmed", label: "Confirm" },
    { to: "cancelled", label: "Cancel" },
  ],
  confirmed: [
    { to: "delivered", label: "Mark delivered" },
    { to: "cancelled", label: "Cancel" },
  ],
  delivered: [],
  cancelled: [],
};

type TabValue = "all" | OrderStatus;

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [districtFilter, setDistrictFilter] = useState("");
  const [tab, setTab] = useState<TabValue>("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ districts: District[] }>("/api/districts").then((d) => setDistricts(d.districts));
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = districtFilter ? `?districtId=${districtFilter}` : "";
    api<{ orders: Order[] }>(`/api/orders${qs}`)
      .then((d) => setOrders(d.orders))
      .finally(() => setLoading(false));
  }, [districtFilter]);

  const counts = useMemo(() => {
    const c: Record<TabValue, number> = { all: orders.length, pending: 0, confirmed: 0, delivered: 0, cancelled: 0 };
    for (const o of orders) c[o.status]++;
    return c;
  }, [orders]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (tab !== "all" && o.status !== tab) return false;
      if (!q) return true;
      return [o.customerName, o.shopName, o.customerPhone, o.employee.name].some((v) => v?.toLowerCase().includes(q));
    });
  }, [orders, tab, query]);

  const visibleValue = visible.filter((o) => o.status !== "cancelled").reduce((sum, o) => sum + o.totalAmount, 0);

  async function changeStatus(order: Order, to: OrderStatus) {
    if (to === "cancelled" && !window.confirm(`Cancel the order for ${order.customerName}? This can't be undone.`)) {
      return;
    }
    setUpdatingId(order.id);
    setError(null);
    try {
      const { order: updated } = await api<{ order: Pick<Order, "id" | "status"> }>(
        `/api/orders/${order.id}/status`,
        { method: "PATCH", body: JSON.stringify({ status: to }) }
      );
      setOrders((prev) => prev.map((o) => (o.id === updated.id ? { ...o, status: updated.status } : o)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the order");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Orders taken in the field. Confirm them, mark them delivered, or cancel them."
      />

      {error && <Notice tone="error">{error}</Notice>}

      <Card>
        <div className="px-5 pt-2">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "all", label: "All", count: counts.all },
              { value: "pending", label: "Pending", count: counts.pending },
              { value: "confirmed", label: "Confirmed", count: counts.confirmed },
              { value: "delivered", label: "Delivered", count: counts.delivered },
              { value: "cancelled", label: "Cancelled", count: counts.cancelled },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customer, shop or employee"
              className="pl-9"
            />
          </div>
          <div className="w-full sm:w-52">
            <Select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)}>
              <option value="">All districts</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="ml-auto text-[13px] text-neutral-500">
            {visible.length} {visible.length === 1 ? "order" : "orders"} ·{" "}
            <span className="font-semibold text-neutral-900">{formatINR(visibleValue)}</span>
            {tab === "all" || tab === "cancelled" ? " excl. cancelled" : ""}
          </div>
        </div>

        <Table>
          <thead>
            <tr>
              <Th className="w-8" />
              <Th>Customer</Th>
              <Th>Items</Th>
              <Th>Taken by</Th>
              <Th>Placed</Th>
              <Th className="text-right">Amount</Th>
              <Th>Status</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <MessageRow colSpan={8}>Loading orders…</MessageRow>}
            {!loading && visible.length === 0 && (
              <MessageRow colSpan={8}>{orders.length ? "No orders match these filters." : "No orders yet."}</MessageRow>
            )}
            {!loading &&
              visible.map((o) => {
                const expanded = expandedId === o.id;
                const units = o.items.reduce((n, i) => n + i.quantity, 0);
                const first = o.items[0];
                return (
                  <Fragment key={o.id}>
                    <Tr onClick={() => setExpandedId(expanded ? null : o.id)} className={expanded ? "bg-neutral-50" : ""}>
                      <Td className="pr-0 text-neutral-400">
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Td>
                      <Td className="max-w-[170px]">
                        <div className="truncate font-medium text-neutral-900">{o.customerName}</div>
                        <div className="truncate text-xs text-neutral-500">
                          {[o.shopName, o.customerPhone].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </Td>
                      <Td className="max-w-[230px]">
                        {first ? (
                          <div className="truncate text-neutral-800">
                            {displayProductName(first.variant.product.name)} <span className="text-neutral-500">{first.variant.sizeLabel}</span> ×{" "}
                            {first.quantity}
                          </div>
                        ) : null}
                        <div className="text-xs text-neutral-500">
                          {o.items.length > 1 ? `+${o.items.length - 1} more · ` : ""}
                          {units} {units === 1 ? "pack" : "packs"}
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <div className="text-neutral-800">{o.employee.name}</div>
                        <div className="text-xs text-neutral-500">{o.district.name}</div>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <div className="text-neutral-800">{formatDate(o.createdAt)}</div>
                        <div className="text-xs text-neutral-500">{formatTime(o.createdAt)}</div>
                      </Td>
                      <Td className="text-right font-semibold tabular-nums text-neutral-900">
                        {o.totalAmount > 0 ? formatINR(o.totalAmount) : <span className="text-red-600">₹0</span>}
                      </Td>
                      <Td>
                        <OrderStatusLabel status={o.status} />
                      </Td>
                      <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          {actionsByStatus[o.status].map((a) => (
                            <Button
                              key={a.to}
                              size="sm"
                              variant={a.to === "cancelled" ? "ghost" : "secondary"}
                              disabled={updatingId === o.id}
                              onClick={() => changeStatus(o, a.to)}
                            >
                              {a.label}
                            </Button>
                          ))}
                          {actionsByStatus[o.status].length === 0 ? <span className="text-xs text-neutral-400">—</span> : null}
                        </div>
                      </Td>
                    </Tr>
                    {expanded && (
                      <tr className="border-b border-neutral-200 bg-neutral-50">
                        <td />
                        <td colSpan={7} className="px-4 pb-5 pt-1">
                          <OrderDetail order={o} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function OrderDetail({ order }: { order: Order }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
      <div className="overflow-hidden rounded-md border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-4 py-2 text-left">Product</th>
              <th className="px-4 py-2 text-left">Size</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2 text-right">Unit price</th>
              <th className="px-4 py-2 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.id} className="border-t border-neutral-100">
                <td className="px-4 py-2 text-neutral-800">
                  {displayProductName(i.variant.product.name)}
                  <span className="ml-2 font-mono text-xs text-neutral-400">{i.variant.product.shortCode}</span>
                </td>
                <td className="px-4 py-2 text-neutral-600">{i.variant.sizeLabel}</td>
                <td className="px-4 py-2 text-right tabular-nums">{i.quantity}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {i.unitPrice > 0 ? formatINR(i.unitPrice) : <span className="text-red-600">Not priced</span>}
                </td>
                <td className="px-4 py-2 text-right font-medium tabular-nums">{formatINR(i.unitPrice * i.quantity)}</td>
              </tr>
            ))}
            <tr className="border-t border-neutral-200 bg-neutral-50">
              <td colSpan={4} className="px-4 py-2 text-right text-[13px] font-medium text-neutral-600">
                Order total
              </td>
              <td className="px-4 py-2 text-right font-semibold tabular-nums text-neutral-900">
                {formatINR(order.totalAmount)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <dl className="space-y-3 text-sm">
        <Detail label="Order ID" value={<span className="font-mono text-xs">{order.id}</span>} />
        <Detail label="Customer phone" value={order.customerPhone || "—"} />
        <Detail label="Shop" value={order.shopName || "—"} />
        <Detail label="Notes" value={order.notes || "—"} />
      </dl>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-neutral-400">{label}</dt>
      <dd className="mt-0.5 text-neutral-800">{value}</dd>
    </div>
  );
}

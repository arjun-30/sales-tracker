import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { formatDateTime, formatINR, itemName, itemSize } from "../lib/format";
import type { Order, Store, Visit } from "../lib/types";
import { Card, CardHeader, OrderStatusLabel, Segmented } from "./ui/Card";
import { MessageRow, Table, Td, Th, Tr } from "./ui/Table";

type Tab = "orders" | "visits" | "stores";

// An in-person order taken this far from its shop was probably not taken there.
const FAR_FROM_STORE_M = 300;

// Everything the employee did in the period: each order, each shop visit, and
// the shops they added to the map.
export function EmployeeActivity({ employeeId, from, to }: { employeeId: string; from: string; to: string }) {
  const [tab, setTab] = useState<Tab>("orders");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [visits, setVisits] = useState<Visit[] | null>(null);
  const [stores, setStores] = useState<Store[] | null>(null);

  useEffect(() => {
    const qs = new URLSearchParams({ employeeId, from, to });
    api<{ orders: Order[] }>(`/api/orders?${qs}`).then((d) => setOrders(d.orders));
    api<{ visits: Visit[] }>(`/api/visits?${qs}`).then((d) => setVisits(d.visits));
    api<{ stores: Store[] }>("/api/stores").then((d) => setStores(d.stores.filter((s) => s.createdBy?.id === employeeId)));
  }, [employeeId, from, to]);

  const sales = orders?.filter((o) => o.status !== "cancelled").reduce((sum, o) => sum + o.totalAmount, 0) ?? 0;

  return (
    <Card>
      <CardHeader
        title="Activity"
        description={
          orders
            ? `${orders.length} orders (${formatINR(sales)}) · ${visits?.length ?? 0} visits in this period · ${stores?.length ?? 0} shops added`
            : "Loading…"
        }
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: "orders", label: "Orders" },
              { value: "visits", label: "Visits" },
              { value: "stores", label: "Shops added" },
            ]}
          />
        }
      />
      {tab === "orders" ? (
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Customer</Th>
              <Th>Items</Th>
              <Th>How taken</Th>
              <Th className="text-right">Amount</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {orders === null ? <MessageRow colSpan={6}>Loading orders…</MessageRow> : null}
            {orders?.length === 0 ? <MessageRow colSpan={6}>No orders in this period.</MessageRow> : null}
            {orders?.map((o) => {
              const far = o.channel === "in_person" && o.distanceFromStoreM !== null && o.distanceFromStoreM > FAR_FROM_STORE_M;
              return (
                <Tr key={o.id}>
                  <Td className="whitespace-nowrap">{formatDateTime(o.createdAt)}</Td>
                  <Td className="max-w-48">
                    <div className="truncate font-medium text-neutral-900">{o.customerName}</div>
                    {o.shopName ? <div className="truncate text-xs text-neutral-500">{o.shopName}</div> : null}
                  </Td>
                  <Td className="max-w-64">
                    <div className="truncate text-neutral-700">
                      {o.items.map((i) => `${itemName(i)} ${itemSize(i)} × ${i.quantity}`).join(", ")}
                    </div>
                    {o.voiceNote ? <div className="text-xs text-neutral-500">Has a voice note</div> : null}
                  </Td>
                  <Td className={`whitespace-nowrap text-xs ${far ? "font-semibold text-red-700" : "text-neutral-600"}`}>
                    {o.channel === "phone"
                      ? "By phone"
                      : o.distanceFromStoreM !== null
                        ? `At the shop · ${o.distanceFromStoreM} m away`
                        : "At the shop"}
                  </Td>
                  <Td className="text-right font-semibold tabular-nums">{formatINR(o.totalAmount)}</Td>
                  <Td>
                    <OrderStatusLabel status={o.status} />
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      ) : null}
      {tab === "visits" ? (
        <Table>
          <thead>
            <tr>
              <Th>Shop</Th>
              <Th>Checked in</Th>
              <Th>Checked out</Th>
              <Th>Notes</Th>
            </tr>
          </thead>
          <tbody>
            {visits === null ? <MessageRow colSpan={4}>Loading visits…</MessageRow> : null}
            {visits?.length === 0 ? <MessageRow colSpan={4}>No shop visits in this period.</MessageRow> : null}
            {visits?.map((v) => (
              <Tr key={v.id}>
                <Td className="font-medium text-neutral-900">{v.shopName}</Td>
                <Td className="whitespace-nowrap">{formatDateTime(v.checkInAt)}</Td>
                <Td className="whitespace-nowrap">
                  {v.checkOutAt ? formatDateTime(v.checkOutAt) : <span className="text-neutral-400">Not checked out</span>}
                </Td>
                <Td className="max-w-64 truncate text-neutral-600">{v.notes ?? "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : null}
      {tab === "stores" ? (
        <Table>
          <thead>
            <tr>
              <Th>Shop</Th>
              <Th>Phone</Th>
              <Th>Added</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {stores === null ? <MessageRow colSpan={4}>Loading shops…</MessageRow> : null}
            {stores?.length === 0 ? <MessageRow colSpan={4}>This employee hasn't added any shops.</MessageRow> : null}
            {stores?.map((s) => (
              <Tr key={s.id}>
                <Td>
                  <div className="font-medium text-neutral-900">{s.name}</div>
                  {s.address ? <div className="text-xs text-neutral-500">{s.address}</div> : null}
                </Td>
                <Td className="tabular-nums">{s.phone ?? "—"}</Td>
                <Td className="whitespace-nowrap">{formatDateTime(s.createdAt)}</Td>
                <Td>{s.status === "pending" ? "Waiting for approval" : "Approved"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </Card>
  );
}

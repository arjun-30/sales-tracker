import { Fragment, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Mic, Printer, Search, X } from "lucide-react";
import { api, apiBlob } from "../lib/api";
import { usePlant } from "../context/PlantContext";
import { formatDate, formatINR, formatTime, itemName, itemSize } from "../lib/format";
import type { District, Order, OrderStatus } from "../lib/types";
import { Card, Notice, OrderStatusLabel, PageHeader, Tabs } from "../components/ui/Card";
import { Input, Label, Select } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { MessageRow, Table, Td, Th, Tr } from "../components/ui/Table";

// Mirrors ALLOWED_TRANSITIONS in server/src/routes/orders.routes.ts; the server enforces it.
const actionsByStatus: Record<OrderStatus, { to: OrderStatus; label: string }[]> = {
  pending: [
    { to: "confirmed", label: "Confirm" },
    { to: "cancelled", label: "Cancel" },
  ],
  confirmed: [
    { to: "dispatched", label: "Dispatch" },
    { to: "delivered", label: "Mark delivered" },
    { to: "cancelled", label: "Cancel" },
  ],
  dispatched: [
    { to: "delivered", label: "Mark delivered" },
    { to: "cancelled", label: "Cancel" },
  ],
  delivered: [],
  cancelled: [],
};

type TabValue = "all" | OrderStatus;

export function Orders() {
  const { isSuperAdmin, plantId } = usePlant();
  // Which plant a row belongs to, when the super admin is looking at every plant.
  const showPlant = isSuperAdmin && !plantId;
  const [orders, setOrders] = useState<Order[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [districtFilter, setDistrictFilter] = useState("");
  const [tab, setTab] = useState<TabValue>("all");
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Dispatch and delivery ask for details first.
  const [form, setForm] = useState<{ order: Order; to: "dispatched" | "delivered" } | null>(null);

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
    const c: Record<TabValue, number> = { all: orders.length, pending: 0, confirmed: 0, dispatched: 0, delivered: 0, cancelled: 0 };
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
    if (to === "dispatched" || to === "delivered") {
      setForm({ order, to });
      return;
    }
    if (to === "cancelled" && !window.confirm(`Cancel the order for ${order.customerName}? This can't be undone.`)) {
      return;
    }
    setUpdatingId(order.id);
    setError(null);
    try {
      const { order: updated } = await api<{ order: Order }>(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: to }),
      });
      mergeOrder(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the order");
    } finally {
      setUpdatingId(null);
    }
  }

  // The status endpoint returns the bare order; keep the loaded relations.
  function mergeOrder(updated: Partial<Order> & { id: string }) {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== updated.id) return o;
        const { items: _i, employee: _e, district: _d, plant: _p, voiceNote: _v, deliveryProof, ...fields } = updated;
        return { ...o, ...fields, ...(deliveryProof !== undefined ? { deliveryProof } : {}) };
      })
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders"
        description="Orders taken in the field. Confirm, dispatch and deliver them, print the order copy, or cancel."
      />
      {form && (
        <SupplyForm
          order={form.order}
          to={form.to}
          onClose={() => setForm(null)}
          onSaved={(o) => {
            mergeOrder(o);
            setForm(null);
          }}
        />
      )}

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
              { value: "dispatched", label: "Dispatched", count: counts.dispatched },
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
                        <HowTaken order={o} />
                      </Td>
                      <Td className="max-w-[230px]">
                        {first ? (
                          <div className="truncate text-neutral-800">
                            {itemName(first)} <span className="text-neutral-500">{itemSize(first)}</span> × {first.quantity}
                          </div>
                        ) : null}
                        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                          {o.items.length > 1 ? `+${o.items.length - 1} more · ` : ""}
                          {units} {units === 1 ? "pack" : "packs"}
                          {o.items.some((i) => !i.variantId) ? <span className="text-amber-700">· custom</span> : null}
                          {o.voiceNote ? (
                            <span className="inline-flex items-center gap-0.5 text-neutral-700" title="Has a voice note">
                              · <Mic className="h-3.5 w-3.5" /> voice
                            </span>
                          ) : null}
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap">
                        <div className="text-neutral-800">{o.employee.name}</div>
                        <div className="text-xs text-neutral-500">
                          {o.district.name}
                          {showPlant ? ` · ${o.plant.code}` : ""}
                        </div>
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
                          <PrintButton orderId={o.id} />
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
                  {itemName(i)}
                  {(i.variant?.product ?? i.product) ? (
                    <span className="ml-2 font-mono text-xs text-neutral-400">{(i.variant?.product ?? i.product)!.shortCode}</span>
                  ) : null}
                  {i.shadeName ? <div className="text-xs text-neutral-500">Shade: {i.shadeName}</div> : null}
                </td>
                <td className="px-4 py-2 text-neutral-600">
                  {itemSize(i)}
                  {i.variantId ? null : (
                    <span className="ml-2 text-xs font-medium text-amber-700" title="Size and price set by the salesperson at the shop">
                      Custom
                    </span>
                  )}
                </td>
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
        <Detail label="GSTIN" value={order.gstin ? <span className="font-mono text-xs">{order.gstin}</span> : "—"} />
        <Detail label="Supply and delivery" value={<SupplyDetail order={order} />} />
        <Detail label="How it was taken" value={<HowTaken order={order} long />} />
        <Detail label="Notes" value={order.notes || "—"} />
        {order.voiceNote ? <Detail label="Voice note" value={<VoiceNote orderId={order.id} />} /> : null}
        <Detail label="Order copy" value={<OrderPdfLink orderId={order.id} />} />
        {order.deliveryProof ? <Detail label="Delivery photo" value={<DeliveryPhoto orderId={order.id} />} /> : null}
      </dl>
    </div>
  );
}

// An in-person order taken this far from its shop was probably not taken there.
const FAR_FROM_STORE_M = 300;

function metres(m: number) {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

// By phone, or in person with how far the salesperson's phone was from the shop.
function HowTaken({ order, long = false }: { order: Order; long?: boolean }) {
  if (order.channel === "phone") return <div className="text-xs font-medium text-neutral-700">By phone</div>;
  if (!order.storeId) return long ? <div className="text-xs text-neutral-500">At the shop (not on the map)</div> : null;
  if (order.distanceFromStoreM === null) {
    return <div className="text-xs text-neutral-500">At the shop · position not recorded</div>;
  }
  const far = order.distanceFromStoreM > FAR_FROM_STORE_M;
  return (
    <div className={`text-xs ${far ? "font-semibold text-red-700" : "text-neutral-500"}`}>
      {far
        ? `Marked at the shop, but ${metres(order.distanceFromStoreM)} away`
        : `At the shop · ${metres(order.distanceFromStoreM)} away`}
    </div>
  );
}

// The salesperson's recording of the customer, loaded when the order is opened.
function VoiceNote({ orderId }: { orderId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    apiBlob(`/api/orders/${orderId}/voice-note`)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (live) setSrc(url);
        else URL.revokeObjectURL(url);
      })
      .catch((e) => live && setError(e instanceof Error ? e.message : "Couldn't load the voice note"));
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [orderId]);
  if (error) return <span className="text-red-600">{error}</span>;
  if (!src) return <span className="text-neutral-400">Loading…</span>;
  return (
    <div className="space-y-1">
      <audio controls src={src} className="h-9 w-full" />
      <a href={src} download={`voice-note-${orderId}.m4a`} className="text-xs text-brand-700 hover:underline">
        Download
      </a>
    </div>
  );
}

// The PDF the shop owner gets on WhatsApp, opened in a new tab.
function OrderPdfLink({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function open() {
    // Opened before the download so the browser doesn't block it as a pop-up.
    const tab = window.open("", "_blank");
    setBusy(true);
    setError(null);
    try {
      const blob = await apiBlob(`/api/orders/${orderId}/pdf`);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      tab?.close();
      setError(e instanceof Error ? e.message : "Couldn't open the PDF");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button type="button" onClick={open} disabled={busy} className="text-sm text-brand-700 hover:underline disabled:opacity-50">
        {busy ? "Opening…" : "Open PDF"}
      </button>
      {error ? <div className="text-xs text-red-600">{error}</div> : null}
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

const dateTime = (iso: string) => `${formatDate(iso)}, ${formatTime(iso)}`;

// Where the order is: confirmed, dispatched in which vehicle, delivered when.
function SupplyDetail({ order }: { order: Order }) {
  const lines = [
    order.confirmedAt ? `Confirmed ${dateTime(order.confirmedAt)}` : null,
    order.dispatchedAt ? `Dispatched ${dateTime(order.dispatchedAt)}` : null,
    order.vehicleNo ? `Vehicle ${order.vehicleNo}` : null,
    order.driverName || order.driverPhone ? `Driver ${[order.driverName, order.driverPhone].filter(Boolean).join(", ")}` : null,
    order.deliveredAt ? `Delivered ${dateTime(order.deliveredAt)}` : null,
    order.deliveryNote,
  ].filter((l): l is string => !!l);
  if (lines.length === 0) return <span className="text-neutral-400">Not dispatched yet</span>;
  return (
    <div className="space-y-0.5">
      {lines.map((l) => (
        <div key={l}>{l}</div>
      ))}
    </div>
  );
}

// Dispatch (vehicle, driver) or delivery (time, remark, photo of the slip).
function SupplyForm({
  order,
  to,
  onClose,
  onSaved,
}: {
  order: Order;
  to: "dispatched" | "delivered";
  onClose: () => void;
  onSaved: (o: Partial<Order> & { id: string }) => void;
}) {
  const [vehicleNo, setVehicleNo] = useState(order.vehicleNo ?? "");
  const [driverName, setDriverName] = useState(order.driverName ?? "");
  const [driverPhone, setDriverPhone] = useState(order.driverPhone ?? "");
  const [deliveredAt, setDeliveredAt] = useState(() => localInputValue(new Date()));
  const [deliveryNote, setDeliveryNote] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body =
        to === "dispatched"
          ? { status: to, vehicleNo, driverName, driverPhone }
          : { status: to, deliveredAt: new Date(deliveredAt).toISOString(), deliveryNote };
      const { order: updated } = await api<{ order: Order }>(`/api/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      let deliveryProof: Order["deliveryProof"] | undefined;
      if (photo) {
        const data = new FormData();
        data.append("photo", photo);
        await api(`/api/orders/${order.id}/delivery-proof`, { method: "PUT", body: data });
        deliveryProof = { createdAt: new Date().toISOString() };
      }
      onSaved({ ...updated, ...(deliveryProof ? { deliveryProof } : {}) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[10vh]" onClick={onClose}>
      <form
        onSubmit={save}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-neutral-200 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between border-b border-neutral-200 px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-neutral-900">
              {to === "dispatched" ? "Dispatch order" : "Mark delivered"}
            </h2>
            <p className="mt-0.5 text-[13px] text-neutral-500">
              {order.shopName || order.customerName} · {formatINR(order.totalAmount)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-neutral-400 hover:text-neutral-700" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4 px-5 py-4">
          {error && <Notice tone="error">{error}</Notice>}
          {to === "dispatched" ? (
            <>
              <div>
                <Label>Vehicle number</Label>
                <Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} placeholder="TN 09 AB 1234" autoFocus />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Driver name</Label>
                  <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
                </div>
                <div>
                  <Label>Driver phone</Label>
                  <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} inputMode="tel" />
                </div>
              </div>
              <p className="text-xs text-neutral-500">The shop owner gets an SMS with the vehicle and driver.</p>
            </>
          ) : (
            <>
              <div>
                <Label>Delivered at</Label>
                <Input
                  type="datetime-local"
                  value={deliveredAt}
                  max={localInputValue(new Date())}
                  onChange={(e) => setDeliveredAt(e.target.value)}
                />
              </div>
              <div>
                <Label hint="optional">Remark</Label>
                <Input value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} placeholder="Received by owner" />
              </div>
              <div>
                <Label hint="optional, JPEG or PNG">Photo of the signed slip</Label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => setPhoto(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-neutral-600 file:mr-3 file:rounded-md file:border file:border-neutral-300 file:bg-white file:px-3 file:py-1.5 file:text-[13px] file:font-medium"
                />
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : to === "dispatched" ? "Dispatch" : "Mark delivered"}
          </Button>
        </div>
      </form>
    </div>
  );
}

// "2026-11-07T18:30" in the browser's time zone, for datetime-local inputs.
function localInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Prints the order copy PDF straight from the list, without opening a tab.
function PrintButton({ orderId }: { orderId: string }) {
  const [busy, setBusy] = useState(false);
  async function print() {
    setBusy(true);
    try {
      const blob = await apiBlob(`/api/orders/${orderId}/pdf`);
      const url = URL.createObjectURL(blob);
      const frame = document.createElement("iframe");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      frame.src = url;
      frame.onload = () => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        // Long enough for the print dialog to have read the document.
        setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(url);
        }, 60_000);
      };
      document.body.appendChild(frame);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button size="sm" variant="ghost" onClick={print} disabled={busy} title="Print order copy" aria-label="Print order copy">
      <Printer className="h-4 w-4" />
    </Button>
  );
}

function DeliveryPhoto({ orderId }: { orderId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let live = true;
    apiBlob(`/api/orders/${orderId}/delivery-proof`)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (live) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [orderId]);
  if (!src) return <span className="text-neutral-400">Loading…</span>;
  return (
    <a href={src} target="_blank" rel="noreferrer">
      <img src={src} alt="Delivery slip" className="max-h-40 rounded border border-neutral-200" />
    </a>
  );
}

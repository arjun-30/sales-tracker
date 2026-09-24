import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { District, Order, OrderStatus } from "../lib/types";
import { Card, Badge } from "../components/ui/Card";
import { Select } from "../components/ui/Input";
import { Button } from "../components/ui/Button";

const toneByStatus: Record<Order["status"], "yellow" | "blue" | "green" | "red"> = {
  pending: "yellow",
  confirmed: "blue",
  delivered: "green",
  cancelled: "red",
};

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

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [districtFilter, setDistrictFilter] = useState("");
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Orders</h1>
        <div className="w-56">
          <Select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)}>
            <option value="">All districts</option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Customer</th>
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2">District</th>
              <th className="px-4 py-2">Items</th>
              <th className="px-4 py-2">Total</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Date</th>
              <th className="px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-400" colSpan={8}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && orders.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-400" colSpan={8}>
                  No orders yet.
                </td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-slate-100">
                <td className="px-4 py-2">
                  <div className="font-medium text-slate-800">{o.customerName}</div>
                  {o.shopName && <div className="text-xs text-slate-500">{o.shopName}</div>}
                </td>
                <td className="px-4 py-2">{o.employee.name}</td>
                <td className="px-4 py-2">{o.district.name}</td>
                <td className="px-4 py-2">
                  {o.items
                    .map((i) => `${i.variant.product.name} (${i.variant.sizeLabel}) x${i.quantity}`)
                    .join(", ")}
                </td>
                <td className="px-4 py-2 font-medium">₹{o.totalAmount.toLocaleString("en-IN")}</td>
                <td className="px-4 py-2">
                  <Badge tone={toneByStatus[o.status]}>{o.status}</Badge>
                </td>
                <td className="px-4 py-2 text-slate-500">{new Date(o.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    {actionsByStatus[o.status].map((a) => (
                      <Button
                        key={a.to}
                        variant={a.to === "cancelled" ? "ghost" : "secondary"}
                        className="whitespace-nowrap px-2 py-1 text-xs"
                        disabled={updatingId === o.id}
                        onClick={() => changeStatus(o, a.to)}
                      >
                        {a.label}
                      </Button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

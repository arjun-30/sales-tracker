import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { District, Order } from "../lib/types";
import { Card, Badge } from "../components/ui/Card";
import { Select } from "../components/ui/Input";

const toneByStatus: Record<Order["status"], "yellow" | "blue" | "green" | "red"> = {
  pending: "yellow",
  confirmed: "blue",
  delivered: "green",
  cancelled: "red",
};

export function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [districtFilter, setDistrictFilter] = useState("");
  const [loading, setLoading] = useState(true);

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
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-400" colSpan={7}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && orders.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-400" colSpan={7}>
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
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

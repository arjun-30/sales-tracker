import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../lib/api";
import type { ReportSummary } from "../lib/types";
import { Badge, Card, StatCard } from "../components/ui/Card";

const PALETTE = ["#2563eb", "#16a34a", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#db2777", "#4b5563"];

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "#d97706",
  confirmed: "#2563eb",
  delivered: "#16a34a",
  cancelled: "#dc2626",
};

export function Dashboard() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);

  useEffect(() => {
    api<ReportSummary>("/api/reports/summary").then(setSummary);
  }, []);

  if (!summary) {
    return <div className="text-slate-400">Loading…</div>;
  }

  const gapDistricts = summary.districtActivity.filter(
    (d) => d.employeeCount > 0 && d.ordersCount === 0 && d.visitsCount === 0
  );
  const uncoveredDistricts = summary.districtActivity.filter((d) => d.employeeCount === 0);
  const mostActiveDistricts = summary.districtActivity
    .filter((d) => d.ordersCount > 0 || d.visitsCount > 0)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Total Orders" value={summary.totalOrders} />
        <StatCard label="Total Sales" value={`₹${summary.totalSales.toLocaleString("en-IN")}`} />
        <StatCard label="Total Visits" value={summary.totalVisits} />
        <StatCard label="Employees On Duty" value={summary.activeEmployees} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 text-sm font-medium text-slate-700">Sales by District</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={summary.salesByDistrict}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="districtName" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="totalSales" fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <div className="mb-3 text-sm font-medium text-slate-700">Orders Over Time</div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={summary.ordersOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="total" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Top products & categories */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 text-sm font-medium text-slate-700">Top Products by Revenue</div>
          {summary.topProducts.length === 0 ? (
            <EmptyState text="No product sales yet." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={summary.topProducts} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={160} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="revenue" fill="#2563eb" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-4">
          <div className="mb-3 text-sm font-medium text-slate-700">Revenue by Category</div>
          {summary.revenueByCategory.length === 0 ? (
            <EmptyState text="No product sales yet." />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={summary.revenueByCategory}
                  dataKey="revenue"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={(props: PieLabelProps) => `${props.category} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {summary.revenueByCategory.map((entry, i) => (
                    <Cell key={entry.category} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Employee performance */}
      <Card className="overflow-x-auto">
        <div className="border-b border-slate-200 p-4 text-sm font-medium text-slate-700">
          Employee Leaderboard
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">#</th>
              <th className="px-4 py-2">Employee</th>
              <th className="px-4 py-2">Orders</th>
              <th className="px-4 py-2">Sales</th>
              <th className="px-4 py-2">Visits</th>
              <th className="px-4 py-2">Conversion</th>
            </tr>
          </thead>
          <tbody>
            {summary.employeeLeaderboard.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-400" colSpan={6}>
                  No employee activity yet.
                </td>
              </tr>
            )}
            {summary.employeeLeaderboard.map((emp, i) => (
              <tr key={emp.employeeId} className="border-b border-slate-100">
                <td className="px-4 py-2 text-slate-400">{i + 1}</td>
                <td className="px-4 py-2 font-medium text-slate-800">{emp.name}</td>
                <td className="px-4 py-2">{emp.ordersCount}</td>
                <td className="px-4 py-2">₹{emp.totalSales.toLocaleString("en-IN")}</td>
                <td className="px-4 py-2">{emp.visitsCount}</td>
                <td className="px-4 py-2">
                  {emp.conversionRate === null ? "—" : `${(emp.conversionRate * 100).toFixed(0)}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Order status & stuck orders */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 text-sm font-medium text-slate-700">Order Status Breakdown</div>
          {summary.orderStatusBreakdown.length === 0 ? (
            <EmptyState text="No orders yet." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={summary.orderStatusBreakdown}
                  dataKey="count"
                  nameKey="status"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(props: PieLabelProps) => {
                    const status = props.status ?? "";
                    return `${STATUS_LABEL[status] ?? status} (${props.count})`;
                  }}
                >
                  {summary.orderStatusBreakdown.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLOR[entry.status] ?? "#64748b"} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend formatter={(value: string) => STATUS_LABEL[value] ?? value} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="overflow-x-auto">
          <div className="border-b border-slate-200 p-4 text-sm font-medium text-slate-700">
            Pending Orders Needing Attention
          </div>
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2">Employee</th>
                <th className="px-4 py-2">Amount</th>
                <th className="px-4 py-2">Age</th>
              </tr>
            </thead>
            <tbody>
              {summary.stuckPendingOrders.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-slate-400" colSpan={4}>
                    No pending orders.
                  </td>
                </tr>
              )}
              {summary.stuckPendingOrders.map((o) => (
                <tr key={o.id} className="border-b border-slate-100">
                  <td className="px-4 py-2 font-medium text-slate-800">
                    {o.customerName}
                    {o.shopName ? <span className="text-slate-400"> · {o.shopName}</span> : null}
                  </td>
                  <td className="px-4 py-2">{o.employeeName}</td>
                  <td className="px-4 py-2">₹{o.totalAmount.toLocaleString("en-IN")}</td>
                  <td className="px-4 py-2">
                    <Badge tone={o.isStuck ? "red" : "yellow"}>{ageLabel(o.createdAt)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* District coverage */}
      <Card className="overflow-x-auto">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div className="text-sm font-medium text-slate-700">District Coverage</div>
          <div className="text-xs text-slate-500">
            {uncoveredDistricts.length} of {summary.districtActivity.length} districts have no assigned employee ·{" "}
            {gapDistricts.length} assigned but no recent activity
          </div>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">District</th>
              <th className="px-4 py-2">Employees</th>
              <th className="px-4 py-2">On Duty</th>
              <th className="px-4 py-2">Orders</th>
              <th className="px-4 py-2">Visits</th>
            </tr>
          </thead>
          <tbody>
            {mostActiveDistricts.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-400" colSpan={5}>
                  No district activity yet.
                </td>
              </tr>
            )}
            {mostActiveDistricts.map((d) => (
              <tr key={d.districtId} className="border-b border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">{d.districtName}</td>
                <td className="px-4 py-2">{d.employeeCount}</td>
                <td className="px-4 py-2">{d.onDutyCount}</td>
                <td className="px-4 py-2">{d.ordersCount}</td>
                <td className="px-4 py-2">{d.visitsCount}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {gapDistricts.length > 0 && (
          <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            <span className="font-medium text-slate-700">Coverage gaps: </span>
            {gapDistricts.map((d) => d.districtName).join(", ")} — have an assigned employee but no orders or visits
            in this period.
          </div>
        )}
      </Card>
    </div>
  );
}

// recharts v3's PieLabelRenderProps doesn't carry our data fields directly (they're
// nested under `.payload`), but at runtime the flattened props recharts passes in do
// include them — this type matches what we actually read off `props` at the call site.
type PieLabelProps = { category?: string; status?: string; count?: number; percent?: number };

function formatCurrency(value: unknown): string {
  return `₹${Number(value).toLocaleString("en-IN")}`;
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex h-[240px] items-center justify-center text-sm text-slate-400">{text}</div>;
}

function ageLabel(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days}d ago`;
  const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
  return `${hours}h ago`;
}

import { useEffect, useState } from "react";
import { CalendarDays, IndianRupee, Receipt, Store, UserCheck } from "lucide-react";
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
import type { District, ReportSummary } from "../lib/types";
import { Card, CardHeader, PageHeader, Segmented, StatCard, Status } from "../components/ui/Card";
import { Select } from "../components/ui/Input";

// Primary series in near-black with Roalux red as the highlight; categories use the logo swatches.
const INK = "#262626";
const RED = "#d4202a";
const PALETTE = ["#262626", "#d4202a", "#4db848", "#f5921e", "#00a6e6", "#e5007d", "#d4b800", "#a3a3a3"];

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "#d97706",
  confirmed: "#0284c7",
  delivered: "#16a34a",
  cancelled: "#dc2626",
};

const PERIODS = [
  { id: "today", label: "Today", days: 0 },
  { id: "7d", label: "Last 7 days", days: 6 },
  { id: "30d", label: "Last 30 days", days: 29 },
  { id: "all", label: "All time", days: null },
] as const;

type PeriodId = (typeof PERIODS)[number]["id"];

// Start of the period in the admin's local time (IST for this business).
function periodStart(id: PeriodId): Date | null {
  const period = PERIODS.find((p) => p.id === id)!;
  if (period.days === null) return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - period.days);
  return d;
}

export function Dashboard() {
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [districts, setDistricts] = useState<District[]>([]);
  const [period, setPeriod] = useState<PeriodId>("30d");
  const [districtId, setDistrictId] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ districts: District[] }>("/api/districts").then((d) => setDistricts(d.districts));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    const from = periodStart(period);
    if (from) params.set("from", from.toISOString());
    if (districtId) params.set("districtId", districtId);
    setLoading(true);
    api<ReportSummary>(`/api/reports/summary${params.size ? `?${params}` : ""}`)
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [period, districtId]);

  const filters = (
    <>
      <Segmented value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p.id, label: p.label }))} />
      <div className="w-48">
        <Select value={districtId} onChange={(e) => setDistrictId(e.target.value)}>
          <option value="">All districts</option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>
    </>
  );

  if (!summary) {
    return (
      <div className="space-y-6">
        <PageHeader title="Dashboard" actions={filters} />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-neutral-200/60" />
          ))}
        </div>
      </div>
    );
  }

  const periodLabel = PERIODS.find((p) => p.id === period)!.label.toLowerCase();
  const districtName = districts.find((d) => d.id === districtId)?.name;

  // Orders exist but every one is ₹0 when prices haven't been set; a chart of
  // zeros reads as broken, so say why instead.
  const hasSalesValue = summary.totalSales > 0;
  const noValueText = summary.totalOrders
    ? "These orders have no value yet. Set product prices so new orders carry amounts."
    : "No sales in this period.";

  const gapDistricts = summary.districtActivity.filter(
    (d) => d.employeeCount > 0 && d.ordersCount === 0 && d.visitsCount === 0
  );
  const uncoveredDistricts = summary.districtActivity.filter((d) => d.employeeCount === 0);
  const mostActiveDistricts = summary.districtActivity
    .filter((d) => d.ordersCount > 0 || d.visitsCount > 0)
    .slice(0, 8);

  return (
    <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`}>
      <PageHeader
        title="Dashboard"
        description={
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" />
            Showing {periodLabel} {districtName ? `in ${districtName}` : "across all districts"}
          </span>
        }
        actions={filters}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Orders" value={summary.totalOrders.toLocaleString("en-IN")} icon={Receipt} hint="Cancelled orders excluded" />
        <StatCard
          label="Sales"
          value={formatCurrency(summary.totalSales)}
          icon={IndianRupee}
          accent
          hint={
            summary.totalOrders
              ? `Avg ${formatCurrency(Math.round(summary.totalSales / summary.totalOrders))} per order`
              : undefined
          }
        />
        <StatCard
          label="Shop visits"
          value={summary.totalVisits.toLocaleString("en-IN")}
          icon={Store}
          hint={
            summary.totalVisits
              ? `${(summary.totalOrders / summary.totalVisits).toFixed(1)} orders per visit`
              : undefined
          }
        />
        <StatCard
          label="On duty now"
          value={summary.activeEmployees}
          icon={UserCheck}
          hint="Live count, ignores filters"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Sales by district" />
          <div className="p-4">
          {!hasSalesValue ? (
            <EmptyState text={noValueText} />
          ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={summary.salesByDistrict}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
              <XAxis dataKey="districtName" tick={{ fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={70} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => formatCurrency(value)} cursor={{ fill: "#f5f5f5" }} />
              <Bar dataKey="totalSales" fill={INK} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Sales over time" description="Daily order value, cancelled orders excluded" />
          <div className="p-4">
          {!hasSalesValue ? (
            <EmptyState text={noValueText} />
          ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={summary.ordersOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
              <Line type="monotone" dataKey="total" stroke={RED} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          )}
          </div>
        </Card>
      </div>

      {/* Top products & categories */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top products by revenue" />
          <div className="p-4">
          {!hasSalesValue ? (
            <EmptyState text={noValueText} />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={summary.topProducts} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" vertical={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={160} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="revenue" fill={INK} radius={[0, 2, 2, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Revenue by category" />
          <div className="p-4">
          {!hasSalesValue ? (
            <EmptyState text={noValueText} />
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
          </div>
        </Card>
      </div>

      {/* Employee performance */}
      <Card className="overflow-x-auto">
        <CardHeader title="Employee leaderboard" description="Ranked by sales in the selected period." />
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">#</th>
              <th className="px-5 py-3 font-medium">Employee</th>
              <th className="px-5 py-3 font-medium">Orders</th>
              <th className="px-5 py-3 font-medium">Sales</th>
              <th className="px-5 py-3 font-medium">Visits</th>
              <th className="px-5 py-3 font-medium">Orders per visit</th>
            </tr>
          </thead>
          <tbody>
            {summary.employeeLeaderboard.length === 0 && (
              <tr>
                <td className="px-5 py-10 text-center text-sm text-neutral-400" colSpan={6}>
                  No employee activity yet.
                </td>
              </tr>
            )}
            {summary.employeeLeaderboard.map((emp, i) => (
              <tr key={emp.employeeId} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50/70">
                <td className="px-5 py-3 text-neutral-400">{i + 1}</td>
                <td className="px-5 py-3 font-medium text-neutral-800">{emp.name}</td>
                <td className="px-5 py-3">{emp.ordersCount}</td>
                <td className="px-5 py-3 font-medium tabular-nums text-neutral-900">{formatCurrency(emp.totalSales)}</td>
                <td className="px-5 py-3">{emp.visitsCount}</td>
                <td className="px-5 py-3">
                  {emp.conversionRate === null ? "—" : emp.conversionRate.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Order status & stuck orders */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Order status" />
          <div className="p-4">
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
                    <Cell key={entry.status} fill={STATUS_COLOR[entry.status] ?? "#737373"} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend formatter={(value: string) => STATUS_LABEL[value] ?? value} />
              </PieChart>
            </ResponsiveContainer>
          )}
          </div>
        </Card>

        <Card className="overflow-x-auto">
          <CardHeader title="Pending orders" description="Oldest first. Red means waiting more than 2 days." />
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              <tr>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Employee</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Age</th>
              </tr>
            </thead>
            <tbody>
              {summary.stuckPendingOrders.length === 0 && (
                <tr>
                  <td className="px-5 py-10 text-center text-sm text-neutral-400" colSpan={4}>
                    No pending orders.
                  </td>
                </tr>
              )}
              {summary.stuckPendingOrders.map((o) => (
                <tr key={o.id} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50/70">
                  <td className="px-5 py-3 font-medium text-neutral-800">
                    {o.customerName}
                    {o.shopName ? <span className="text-neutral-400"> · {o.shopName}</span> : null}
                  </td>
                  <td className="px-5 py-3">{o.employeeName}</td>
                  <td className="px-5 py-3 tabular-nums">{formatCurrency(o.totalAmount)}</td>
                  <td className="px-5 py-3">
                    <Status tone={o.isStuck ? "red" : "amber"}>{ageLabel(o.createdAt)}</Status>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* District coverage */}
      <Card className="overflow-x-auto">
        <CardHeader
          title="District coverage"
          description={
            <>
              {uncoveredDistricts.length} of {summary.districtActivity.length} districts have no assigned employee ·{" "}
              {gapDistricts.length} assigned but no recent activity
            </>
          }
        />
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            <tr>
              <th className="px-5 py-3 font-medium">District</th>
              <th className="px-5 py-3 font-medium">Employees</th>
              <th className="px-5 py-3 font-medium">On Duty</th>
              <th className="px-5 py-3 font-medium">Orders</th>
              <th className="px-5 py-3 font-medium">Visits</th>
            </tr>
          </thead>
          <tbody>
            {mostActiveDistricts.length === 0 && (
              <tr>
                <td className="px-5 py-10 text-center text-sm text-neutral-400" colSpan={5}>
                  No district activity yet.
                </td>
              </tr>
            )}
            {mostActiveDistricts.map((d) => (
              <tr key={d.districtId} className="border-b border-neutral-100 transition-colors last:border-0 hover:bg-neutral-50/70">
                <td className="px-5 py-3 font-medium text-neutral-800">{d.districtName}</td>
                <td className="px-5 py-3">{d.employeeCount}</td>
                <td className="px-5 py-3">{d.onDutyCount}</td>
                <td className="px-5 py-3">{d.ordersCount}</td>
                <td className="px-5 py-3">{d.visitsCount}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {gapDistricts.length > 0 && (
          <div className="border-t border-neutral-200 px-4 py-3 text-xs text-neutral-500">
            <span className="font-medium text-neutral-700">Coverage gaps: </span>
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
  return (
    <div className="flex h-[240px] items-center justify-center px-8 text-center text-sm text-neutral-500">{text}</div>
  );
}

function ageLabel(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days}d ago`;
  const hours = Math.max(1, Math.floor(ms / (60 * 60 * 1000)));
  return `${hours}h ago`;
}

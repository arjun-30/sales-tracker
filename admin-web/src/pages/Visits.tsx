import { Fragment, useEffect, useMemo, useState } from "react";
import { Clock, MapPin, Receipt, Search, Store, Timer, TrendingUp } from "lucide-react";
import { api } from "../lib/api";
import { formatDay, formatINR, formatMinutes, formatTime } from "../lib/format";
import type { District, Employee, Order, Visit } from "../lib/types";
import { Card, PageHeader, Segmented, StatCard, Tabs } from "../components/ui/Card";
import { Input, Select } from "../components/ui/Input";
import { MessageRow, Table, Td, Th, Tr } from "../components/ui/Table";

type TabValue = "all" | "open" | "done";
type RangeId = "today" | "7d" | "30d" | "all";

const RANGES: { value: RangeId; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "all", label: "All" },
];

// An order counts as coming from a visit if the same salesperson placed it for
// the same shop between check-in and an hour after check-out.
const ORDER_GRACE_MS = 60 * 60 * 1000;

function rangeStart(id: RangeId): Date | null {
  if (id === "all") return null;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (id === "7d") d.setDate(d.getDate() - 6);
  if (id === "30d") d.setDate(d.getDate() - 29);
  return d;
}

function minutesBetween(from: string, to: string | null): number {
  return ((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 60000;
}

const sameShop = (a: string | null, b: string) => !!a && a.trim().toLowerCase() === b.trim().toLowerCase();

export function Visits() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [districtFilter, setDistrictFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [range, setRange] = useState<RangeId>("7d");
  const [tab, setTab] = useState<TabValue>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ districts: District[] }>("/api/districts").then((d) => setDistricts(d.districts));
    api<{ employees: Employee[] }>("/api/employees").then((d) => setEmployees(d.employees));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    const from = rangeStart(range);
    if (from) params.set("from", from.toISOString());
    if (districtFilter) params.set("districtId", districtFilter);
    if (employeeFilter) params.set("employeeId", employeeFilter);
    const qs = params.size ? `?${params}` : "";
    Promise.all([api<{ visits: Visit[] }>(`/api/visits${qs}`), api<{ orders: Order[] }>(`/api/orders${qs}`)])
      .then(([v, o]) => {
        setVisits(v.visits);
        setOrders(o.orders.filter((x) => x.status !== "cancelled"));
      })
      .finally(() => setLoading(false));
  }, [range, districtFilter, employeeFilter]);

  // Which order (if any) came out of each visit.
  const orderByVisit = useMemo(() => {
    const map = new Map<string, Order>();
    for (const v of visits) {
      const start = new Date(v.checkInAt).getTime();
      const end = (v.checkOutAt ? new Date(v.checkOutAt).getTime() : Date.now()) + ORDER_GRACE_MS;
      const match = orders.find((o) => {
        const t = new Date(o.createdAt).getTime();
        return o.employeeId === v.employeeId && sameShop(o.shopName, v.shopName) && t >= start && t <= end;
      });
      if (match) map.set(v.id, match);
    }
    return map;
  }, [visits, orders]);

  const openCount = visits.filter((v) => !v.checkOutAt).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visits.filter((v) => {
      if (tab === "open" && v.checkOutAt) return false;
      if (tab === "done" && !v.checkOutAt) return false;
      if (!q) return true;
      return [v.shopName, v.employee.name, v.notes].some((s) => s?.toLowerCase().includes(q));
    });
  }, [visits, tab, query]);

  const days = useMemo(() => {
    const groups: { key: string; label: string; visits: Visit[]; minutes: number }[] = [];
    for (const v of visible) {
      const key = new Date(v.checkInAt).toDateString();
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) {
        g = { key, label: formatDay(v.checkInAt), visits: [], minutes: 0 };
        groups.push(g);
      }
      g.visits.push(v);
      g.minutes += minutesBetween(v.checkInAt, v.checkOutAt);
    }
    return groups;
  }, [visible]);

  const completed = visits.filter((v) => v.checkOutAt);
  const avgMinutes = completed.length
    ? completed.reduce((sum, v) => sum + minutesBetween(v.checkInAt, v.checkOutAt), 0) / completed.length
    : 0;
  const shopsCovered = new Set(visits.map((v) => v.shopName.trim().toLowerCase())).size;
  const converted = visits.filter((v) => orderByVisit.has(v.id));
  const convertedValue = converted.reduce((sum, v) => sum + orderByVisit.get(v.id)!.totalAmount, 0);
  const rangeLabel = RANGES.find((r) => r.value === range)!.label.toLowerCase();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shop Visits"
        description="Every shop check-in from the field, and whether it led to an order."
        actions={<Segmented value={range} onChange={setRange} options={RANGES} />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Visits"
          value={visits.length}
          icon={Store}
          hint={openCount ? `${openCount} in progress now` : `In the last ${rangeLabel === "all" ? "period" : rangeLabel}`}
        />
        <StatCard label="Shops covered" value={shopsCovered} icon={MapPin} hint="Different shops visited" />
        <StatCard label="Avg time in shop" value={formatMinutes(avgMinutes)} icon={Timer} hint="Completed visits" />
        <StatCard
          label="Visits with an order"
          value={visits.length ? `${Math.round((converted.length / visits.length) * 100)}%` : "–"}
          icon={TrendingUp}
          hint={converted.length ? `${converted.length} orders · ${formatINR(convertedValue)}` : "No orders from visits yet"}
          accent
        />
      </div>

      <Card>
        <div className="px-5 pt-2">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "all", label: "All", count: visits.length },
              { value: "open", label: "In progress", count: openCount },
              { value: "done", label: "Completed", count: visits.length - openCount },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shop, employee or notes"
              className="pl-9"
            />
          </div>
          <div className="w-full sm:w-48">
            <Select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)}>
              <option value="">All districts</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-full sm:w-48">
            <Select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}>
              <option value="">All employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                  {e.employeeCode ? ` (${e.employeeCode})` : ""}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <Table>
          <thead>
            <tr>
              <Th>Shop</Th>
              <Th>Employee</Th>
              <Th>Time</Th>
              <Th className="text-right">In shop</Th>
              <Th>Outcome</Th>
              <Th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {loading && <MessageRow colSpan={6}>Loading visits…</MessageRow>}
            {!loading && visible.length === 0 && (
              <MessageRow colSpan={6}>{visits.length ? "No visits match these filters." : "No visits in this period."}</MessageRow>
            )}
            {!loading &&
              days.map((day) => (
                <Fragment key={day.key}>
                  <tr className="border-b border-neutral-200 bg-sand-50">
                    <td colSpan={6} className="px-5 py-2">
                      <span className="text-[13px] font-semibold text-neutral-800">{day.label}</span>
                      <span className="ml-3 text-xs text-neutral-500">
                        {day.visits.length} {day.visits.length === 1 ? "visit" : "visits"} · {formatMinutes(day.minutes)} in shops
                      </span>
                    </td>
                  </tr>
                  {day.visits.map((v) => {
                    const order = orderByVisit.get(v.id);
                    return (
                      <Tr key={v.id}>
                        <Td className="max-w-[260px]">
                          <div className="truncate font-medium text-neutral-900">{v.shopName}</div>
                          {v.notes ? <div className="truncate text-xs text-neutral-500">{v.notes}</div> : null}
                        </Td>
                        <Td className="whitespace-nowrap">
                          <div className="text-neutral-800">{v.employee.name}</div>
                          <div className="text-xs text-neutral-500">{v.district.name}</div>
                        </Td>
                        <Td className="whitespace-nowrap tabular-nums">
                          {formatTime(v.checkInAt)} –{" "}
                          {v.checkOutAt ? (
                            formatTime(v.checkOutAt)
                          ) : (
                            <span className="inline-flex items-center gap-1 font-medium text-amber-600">
                              <Clock className="h-3.5 w-3.5" strokeWidth={2.25} /> In progress
                            </span>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-right font-medium tabular-nums text-neutral-900">
                          {formatMinutes(minutesBetween(v.checkInAt, v.checkOutAt))}
                        </Td>
                        <Td className="whitespace-nowrap">
                          {order ? (
                            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
                              <Receipt className="h-4 w-4" strokeWidth={2.25} />
                              Order {formatINR(order.totalAmount)}
                            </span>
                          ) : (
                            <span className="text-[13px] text-neutral-400">No order</span>
                          )}
                        </Td>
                        <Td>
                          <a
                            href={`https://www.google.com/maps?q=${v.checkInLat},${v.checkInLng}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Check-in location on Google Maps"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-brand-700"
                          >
                            <MapPin className="h-4 w-4" />
                          </a>
                        </Td>
                      </Tr>
                    );
                  })}
                </Fragment>
              ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

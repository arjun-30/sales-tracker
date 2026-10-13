import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { api } from "../lib/api";
import { formatDate, formatMinutes, formatTime } from "../lib/format";
import type { District, Visit } from "../lib/types";
import { Card, PageHeader, Status, Tabs } from "../components/ui/Card";
import { Input, Select } from "../components/ui/Input";
import { MessageRow, Table, Td, Th, Tr } from "../components/ui/Table";

type TabValue = "all" | "open" | "done";

function minutesBetween(from: string, to: string | null): number {
  return ((to ? new Date(to).getTime() : Date.now()) - new Date(from).getTime()) / 60000;
}

export function Visits() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [districtFilter, setDistrictFilter] = useState("");
  const [tab, setTab] = useState<TabValue>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ districts: District[] }>("/api/districts").then((d) => setDistricts(d.districts));
  }, []);

  useEffect(() => {
    setLoading(true);
    const qs = districtFilter ? `?districtId=${districtFilter}` : "";
    api<{ visits: Visit[] }>(`/api/visits${qs}`)
      .then((d) => setVisits(d.visits))
      .finally(() => setLoading(false));
  }, [districtFilter]);

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

  const completed = visible.filter((v) => v.checkOutAt);
  const avgMinutes = completed.length
    ? completed.reduce((sum, v) => sum + minutesBetween(v.checkInAt, v.checkOutAt), 0) / completed.length
    : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shop Visits"
        description="Every shop check-in and check-out from the field, newest first."
      />

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
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search shop, employee or notes"
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
            {visible.length} {visible.length === 1 ? "visit" : "visits"}
            {completed.length ? (
              <>
                {" "}
                · avg <span className="font-semibold text-neutral-900">{formatMinutes(avgMinutes)}</span> per visit
              </>
            ) : null}
          </div>
        </div>

        <Table>
          <thead>
            <tr>
              <Th>Shop</Th>
              <Th>Employee</Th>
              <Th>Date</Th>
              <Th>Check-in</Th>
              <Th>Check-out</Th>
              <Th className="text-right">Time in shop</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <MessageRow colSpan={6}>Loading visits…</MessageRow>}
            {!loading && visible.length === 0 && (
              <MessageRow colSpan={6}>{visits.length ? "No visits match these filters." : "No visits yet."}</MessageRow>
            )}
            {!loading &&
              visible.map((v) => (
                <Tr key={v.id}>
                  <Td>
                    <div className="font-medium text-neutral-900">{v.shopName}</div>
                    {v.notes ? <div className="max-w-xs truncate text-xs text-neutral-500">{v.notes}</div> : null}
                  </Td>
                  <Td>
                    <div className="text-neutral-800">{v.employee.name}</div>
                    <div className="text-xs text-neutral-500">{v.district.name}</div>
                  </Td>
                  <Td className="whitespace-nowrap">{formatDate(v.checkInAt)}</Td>
                  <Td className="tabular-nums">{formatTime(v.checkInAt)}</Td>
                  <Td className="tabular-nums">
                    {v.checkOutAt ? formatTime(v.checkOutAt) : <Status tone="amber">In progress</Status>}
                  </Td>
                  <Td className="text-right font-medium tabular-nums text-neutral-900">
                    {formatMinutes(minutesBetween(v.checkInAt, v.checkOutAt))}
                  </Td>
                </Tr>
              ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

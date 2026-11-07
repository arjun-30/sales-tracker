import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatMinutes, formatTime } from "../lib/format";
import type { MonthlyAttendance } from "../lib/types";
import { usePlant } from "../context/PlantContext";
import { Card, Notice, PageHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";

// The current month in IST, "2026-11".
function thisMonth() {
  return new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 7);
}

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });

const weekday = (date: string) => new Date(`${date}T00:00:00`).getDay();

// P present (a full day on duty), H half day, A absent; Sundays and days still
// to come are left blank.
const MARK = { present: "P", half: "H", absent: "A" } as const;
const MARK_CLASS = {
  present: "bg-emerald-50 text-emerald-800",
  half: "bg-amber-50 text-amber-800",
  absent: "text-red-600",
} as const;

export function StaffAttendance() {
  const { plantId } = usePlant();
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState<MonthlyAttendance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api<MonthlyAttendance>(`/api/reports/attendance?month=${month}`)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load attendance"))
      .finally(() => setLoading(false));
  }, [month, plantId]);

  const totals = useMemo(() => {
    if (!data) return null;
    return {
      staff: data.rows.length,
      present: data.rows.reduce((s, r) => s + r.present, 0),
      half: data.rows.reduce((s, r) => s + r.half, 0),
    };
  }, [data]);

  function downloadCsv() {
    if (!data) return;
    const header = ["Code", "Name", ...data.dates.map((d) => d.slice(8)), "Present", "Half", "Hours"];
    const lines = data.rows.map((r) => [
      r.employee.employeeCode ?? "",
      r.employee.name,
      ...r.days.map((d) => (d.date > data.today ? "" : MARK[d.status])),
      String(r.present),
      String(r.half),
      (r.totalMinutes / 60).toFixed(1),
    ]);
    const csv = [header, ...lines].map((row) => row.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `Roalux-attendance-${data.month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff attendance"
        description={
          data
            ? `P is ${formatMinutes(data.fullDayMinutes)} or more on duty, H is less, A is no duty. Duty still on at 9 pm is ended automatically (marked •).`
            : "Every salesperson's month at a glance."
        }
      />
      {error && <Notice tone="error">{error}</Notice>}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-5 py-3">
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="w-36 text-center text-[15px] font-semibold text-neutral-900">{monthLabel(month)}</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMonth((m) => shiftMonth(m, 1))}
              disabled={month >= thisMonth()}
              aria-label="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {totals ? (
            <div className="text-[13px] text-neutral-500">
              {totals.staff} staff · {totals.present} full days · {totals.half} half days
            </div>
          ) : null}
          <div className="ml-auto">
            <Button size="sm" variant="secondary" onClick={downloadCsv} disabled={!data || data.rows.length === 0}>
              <Download className="h-4 w-4" /> Excel (CSV)
            </Button>
          </div>
        </div>

        {loading && <div className="px-5 py-8 text-sm text-neutral-500">Loading attendance…</div>}
        {!loading && data && data.rows.length === 0 && (
          <div className="px-5 py-8 text-sm text-neutral-500">No sales staff in this plant.</div>
        )}
        {!loading && data && data.rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50 text-neutral-500">
                  <th className="sticky left-0 z-10 min-w-[180px] bg-neutral-50 px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider">
                    Staff
                  </th>
                  {data.dates.map((d) => (
                    <th
                      key={d}
                      className={`w-7 min-w-[28px] px-0 py-2 text-center font-medium ${weekday(d) === 0 ? "text-neutral-300" : ""}`}
                    >
                      {Number(d.slice(8))}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">P</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">H</th>
                  <th className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Hours</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.employee.id} className="border-b border-neutral-100 hover:bg-neutral-50/60">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2">
                      <Link
                        to={`/attendance?code=${encodeURIComponent(r.employee.employeeCode ?? "")}`}
                        className="font-medium text-neutral-900 hover:text-brand-700 hover:underline"
                      >
                        {r.employee.name}
                      </Link>
                      <div className="font-mono text-[11px] text-neutral-500">
                        {r.employee.employeeCode}
                        {!r.employee.active ? " · inactive" : ""}
                      </div>
                    </td>
                    {r.days.map((d) => {
                      const future = d.date > data.today;
                      const sunday = weekday(d.date) === 0;
                      const blank = future || (sunday && d.status === "absent");
                      const title = d.minutes
                        ? `${d.date}: ${formatMinutes(d.minutes)} on duty${d.firstOn ? `, ${formatTime(d.firstOn)}` : ""}${
                            d.lastOff ? ` to ${formatTime(d.lastOff)}` : ", still on"
                          }${d.autoEnded ? ", ended at 9 pm" : ""}`
                        : d.date;
                      return (
                        <td
                          key={d.date}
                          title={title}
                          className={`relative h-9 text-center font-semibold ${blank ? "text-neutral-200" : MARK_CLASS[d.status]}`}
                        >
                          {blank ? "" : MARK[d.status]}
                          {d.autoEnded ? <span className="absolute right-0.5 top-0.5 text-[9px] leading-none text-red-600">•</span> : null}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-semibold tabular-nums text-neutral-900">{r.present}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-700">{r.half}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-700">{(r.totalMinutes / 60).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

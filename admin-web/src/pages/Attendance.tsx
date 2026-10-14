import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays, Clock, Receipt, Search, Store } from "lucide-react";
import { api } from "../lib/api";
import { formatDay, formatDateTime, formatINR, formatMinutes, formatTime, timeAgo } from "../lib/format";
import type { AttendanceReport, DutySession } from "../lib/types";
import { Card, CardHeader, Notice, PageHeader, Segmented, StatCard, Status } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { MessageRow, Table, Td, Th, Tr } from "../components/ui/Table";

type RangeId = "today" | "7d" | "30d" | "month";

const RANGES: { value: RangeId; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "month", label: "This month" },
];

// A full working day, for scaling the per-day bars.
const FULL_DAY_MINUTES = 9 * 60;

function rangeStart(id: RangeId): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (id === "7d") d.setDate(d.getDate() - 6);
  if (id === "30d") d.setDate(d.getDate() - 29);
  if (id === "month") d.setDate(1);
  return d;
}

const END_REASON: Record<NonNullable<DutySession["endReason"]>, string> = {
  manual: "Went off duty",
  timeout: "No signal, closed automatically",
  deactivated: "Account disabled",
};

export function Attendance() {
  const [params, setParams] = useSearchParams();
  const [codeInput, setCodeInput] = useState(params.get("code") ?? "");
  const [range, setRange] = useState<RangeId>("7d");
  const [report, setReport] = useState<AttendanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = params.get("code") ?? "";

  const load = useCallback(async (lookupCode: string, rangeId: RangeId) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ from: rangeStart(rangeId).toISOString(), to: new Date().toISOString() });
      const data = await api<AttendanceReport>(
        `/api/employees/code/${encodeURIComponent(lookupCode)}/attendance?${qs}`
      );
      setReport(data);
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "Could not load attendance");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (code) load(code, range);
  }, [code, range, load]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = codeInput.trim();
    if (trimmed) setParams({ code: trimmed.toUpperCase() });
  }

  const emp = report?.employee;
  const onDuty = emp?.employeeLocation?.onDuty ?? false;
  const openSession = report?.sessions.find((s) => s.endedAt === null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Look up a salesperson by employee code to see the hours they were on duty."
      />

      <Card className="p-5">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-64">
            <label className="mb-1.5 block text-[13px] font-medium text-neutral-700">Employee code</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <Input
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                placeholder="RLX-CHN-001"
                className="pl-9 font-mono tracking-wider"
                autoFocus={!code}
              />
            </div>
          </div>
          <Button type="submit" disabled={!codeInput.trim() || loading}>
            {loading ? "Looking up…" : "Look up"}
          </Button>
          <div className="ml-auto">
            <div className="mb-1.5 text-[13px] font-medium text-neutral-700">Period</div>
            <Segmented value={range} onChange={setRange} options={RANGES} />
          </div>
        </form>
      </Card>

      {error && <Notice tone="error">{error}</Notice>}

      {!report && !error && !loading && (
        <Card className="flex flex-col items-center px-6 py-16 text-center">
          <Clock className="h-8 w-8 text-neutral-300" />
          <div className="mt-3 text-sm font-medium text-neutral-800">Enter an employee code</div>
          <div className="mt-1 max-w-sm text-[13px] text-neutral-500">
            Codes are on the Employees page, e.g. RLX-CHN-001. Hours are counted from when the employee goes on duty in the
            app until they go off duty.
          </div>
        </Card>
      )}

      {report && emp && (
        <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`}>
          <Card className="flex flex-wrap items-center gap-x-10 gap-y-4 px-5 py-4">
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-brand-600 text-sm font-semibold text-white">
                {emp.name
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()}
              </div>
              <div>
                <div className="text-base font-semibold text-neutral-900">{emp.name}</div>
                <div className="font-mono text-xs tracking-wider text-neutral-500">{emp.employeeCode}</div>
              </div>
            </div>
            <Field label="District" value={emp.district?.name ?? "—"} />
            <Field label="Phone" value={emp.phone} />
            <Field
              label="Right now"
              value={
                onDuty ? (
                  <Status tone="green">
                    On duty{openSession ? ` since ${formatTime(openSession.startedAt)}` : ""}
                  </Status>
                ) : (
                  <Status tone="neutral">
                    Off duty
                    {emp.employeeLocation ? (
                      <span className="font-normal text-neutral-500">
                        {" "}
                        · last seen {timeAgo(emp.employeeLocation.updatedAt)}
                      </span>
                    ) : null}
                  </Status>
                )
              }
            />
            {!emp.active && <Field label="Account" value={<Status tone="red">Disabled</Status>} />}
          </Card>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard label="Hours worked" value={formatMinutes(report.totalMinutes)} icon={Clock} accent />
            <StatCard
              label="Days worked"
              value={report.daysWorked}
              icon={CalendarDays}
              hint={report.daysWorked ? `Avg ${formatMinutes(report.averageMinutesPerDay)} per day` : undefined}
            />
            <StatCard
              label="Orders"
              value={report.activity.orders}
              icon={Receipt}
              hint={`${formatINR(report.activity.sales)} in sales`}
            />
            <StatCard label="Shop visits" value={report.activity.visits} icon={Store} hint="Check-ins in this period" />
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
            <Card>
              <CardHeader title="Day by day" description="Hours on duty each day, in Indian time." />
              <Table>
                <thead>
                  <tr>
                    <Th>Day</Th>
                    <Th>On duty</Th>
                    <Th>Off duty</Th>
                    <Th className="text-right">Hours</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.days.length === 0 && <MessageRow colSpan={4}>No duty time in this period.</MessageRow>}
                  {[...report.days].reverse().map((d) => (
                    <Tr key={d.date}>
                      <Td className="whitespace-nowrap font-medium text-neutral-900">{formatDay(`${d.date}T12:00:00+05:30`)}</Td>
                      <Td className="tabular-nums">{formatTime(d.firstOn)}</Td>
                      <Td className="tabular-nums">{d.lastOff ? formatTime(d.lastOff) : <Status tone="green">Still on</Status>}</Td>
                      <Td className="text-right">
                        <div className="flex items-center justify-end gap-3">
                          <div className="hidden h-1.5 w-28 overflow-hidden rounded-sm bg-neutral-100 sm:block">
                            <div
                              className="h-full bg-brand-500"
                              style={{ width: `${Math.min(100, (d.minutes / FULL_DAY_MINUTES) * 100)}%` }}
                            />
                          </div>
                          <span className="w-16 font-semibold tabular-nums text-neutral-900">{formatMinutes(d.minutes)}</span>
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>

            <Card>
              <CardHeader title="Duty sessions" description="Every on-duty stretch, newest first." />
              <Table>
                <thead>
                  <tr>
                    <Th>Started</Th>
                    <Th>Ended</Th>
                    <Th className="text-right">Length</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.sessions.length === 0 && <MessageRow colSpan={3}>No sessions in this period.</MessageRow>}
                  {report.sessions.map((s) => (
                    <Tr key={s.id}>
                      <Td className="whitespace-nowrap">{formatDateTime(s.startedAt)}</Td>
                      <Td>
                        {s.endedAt ? (
                          <>
                            <div className="whitespace-nowrap">{formatDateTime(s.endedAt)}</div>
                            {s.endReason ? <div className="text-xs text-neutral-500">{END_REASON[s.endReason]}</div> : null}
                          </>
                        ) : (
                          <Status tone="green">Still on duty</Status>
                        )}
                      </Td>
                      <Td className="text-right font-medium tabular-nums text-neutral-900">{formatMinutes(s.minutes)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">{label}</div>
      <div className="mt-1 text-sm text-neutral-800">{value}</div>
    </div>
  );
}

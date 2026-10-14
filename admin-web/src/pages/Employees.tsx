import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Clock, Plus, Search, UserCheck, Users, UserX } from "lucide-react";
import { api } from "../lib/api";
import { formatMinutes, timeAgo } from "../lib/format";
import type { District, Employee } from "../lib/types";
import { Card, CardHeader, Notice, PageHeader, StatCard, Status } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Label, Select } from "../components/ui/Input";
import { MessageRow, Table, Td, Th, Tr } from "../components/ui/Table";

export function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [districtId, setDistrictId] = useState("");

  function refresh() {
    setLoading(true);
    api<{ employees: Employee[] }>("/api/employees")
      .then((d) => setEmployees(d.employees))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
    api<{ districts: District[] }>("/api/districts").then((d) => {
      setDistricts(d.districts);
      if (d.districts.length > 0) setDistrictId(d.districts[0].id);
    });
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      [e.name, e.phone, e.employeeCode, e.district?.name].some((v) => v?.toLowerCase().includes(q))
    );
  }, [employees, query]);

  const onDutyCount = employees.filter((e) => e.employeeLocation?.onDuty).length;
  const disabledCount = employees.filter((e) => !e.active).length;
  const minutesToday = employees.reduce((sum, e) => sum + e.minutesToday, 0);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const { employee } = await api<{ employee: Employee }>("/api/employees", {
        method: "POST",
        body: JSON.stringify({ name, phone, password, districtId }),
      });
      setName("");
      setPhone("");
      setPassword("");
      setShowForm(false);
      setNotice({
        tone: "ok",
        text: `${employee.name} added as ${employee.employeeCode}. They log in to the app with ${employee.phone} and the password you set.`,
      });
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create employee");
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword(emp: Employee) {
    const password = window.prompt(`New password for ${emp.name} (at least 4 characters):`);
    if (password === null) return;
    if (password.length < 4) {
      setNotice({ tone: "error", text: "Password must be at least 4 characters." });
      return;
    }
    try {
      await api(`/api/employees/${emp.id}/password`, { method: "POST", body: JSON.stringify({ password }) });
      setNotice({ tone: "ok", text: `Password reset for ${emp.name}. Share the new password with them directly.` });
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Could not reset the password" });
    }
  }

  async function toggleActive(emp: Employee) {
    if (emp.active && !window.confirm(`Disable ${emp.name}? They will be taken off duty and can't log in.`)) return;
    try {
      await api(`/api/employees/${emp.id}`, { method: "PATCH", body: JSON.stringify({ active: !emp.active }) });
      refresh();
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Could not update the employee" });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        description="Field sales staff, their employee codes, districts and today's duty."
        actions={
          <Button onClick={() => setShowForm((s) => !s)} variant={showForm ? "secondary" : "primary"}>
            {showForm ? (
              "Close"
            ) : (
              <>
                <Plus className="h-4 w-4" /> Add employee
              </>
            )}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Sales staff"
          value={employees.length}
          icon={Users}
          hint={`Across ${new Set(employees.map((e) => e.districtId).filter(Boolean)).size} districts`}
        />
        <StatCard label="On duty now" value={onDutyCount} icon={UserCheck} hint="Sharing location live" accent />
        <StatCard label="Hours worked today" value={formatMinutes(minutesToday)} icon={Clock} hint="All staff combined" />
        <StatCard label="Disabled accounts" value={disabledCount} icon={UserX} hint="Can't log in to the app" />
      </div>

      {showForm && (
        <Card>
          <CardHeader
            title="New employee"
            description="An employee code (RLX…) is assigned automatically. Share the phone number and password with them."
          />
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label>Full name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label hint={`${phone.length}/10`}>Mobile number</Label>
              <Input
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                inputMode="numeric"
                pattern="\d{10}"
                maxLength={10}
                placeholder="98765 43210"
                title="Exactly 10 digits"
                required
              />
            </div>
            <div>
              <Label>Temporary password</Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} minLength={4} required />
            </div>
            <div>
              <Label>District</Label>
              <Select value={districtId} onChange={(e) => setDistrictId(e.target.value)}>
                {districts.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
            {error && (
              <div className="sm:col-span-2 lg:col-span-4">
                <Notice tone="error">{error}</Notice>
              </div>
            )}
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <Button type="submit" disabled={submitting || phone.length !== 10}>
                {submitting ? "Creating…" : "Create employee"}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, code, phone or district"
              className="pl-9"
            />
          </div>
          <div className="ml-auto text-[13px] text-neutral-500">
            {visible.length} of {employees.length}
          </div>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Employee</Th>
              <Th>District</Th>
              <Th>Duty</Th>
              <Th className="text-right">Today</Th>
              <Th>Account</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <MessageRow colSpan={7}>Loading employees…</MessageRow>}
            {!loading && visible.length === 0 && (
              <MessageRow colSpan={7}>{employees.length ? "Nobody matches that search." : "No employees yet."}</MessageRow>
            )}
            {!loading &&
              visible.map((emp) => {
                const loc = emp.employeeLocation;
                return (
                  <Tr key={emp.id} className={emp.active ? "" : "opacity-60"}>
                    <Td className="font-mono text-[13px] font-semibold tracking-wider text-neutral-900">
                      {emp.employeeCode ?? "—"}
                    </Td>
                    <Td>
                      <div className="font-medium text-neutral-900">{emp.name}</div>
                      <div className="text-xs tabular-nums text-neutral-500">{emp.phone}</div>
                    </Td>
                    <Td>{emp.district?.name ?? "—"}</Td>
                    <Td>
                      {loc?.onDuty ? (
                        <Status tone="green">On duty</Status>
                      ) : (
                        <>
                          <Status tone="neutral">Off duty</Status>
                          {loc ? <div className="mt-0.5 pl-4 text-xs text-neutral-500">Seen {timeAgo(loc.updatedAt)}</div> : null}
                        </>
                      )}
                    </Td>
                    <Td className="text-right font-semibold tabular-nums text-neutral-900">
                      {emp.minutesToday > 0 ? formatMinutes(emp.minutesToday) : <span className="text-neutral-400">—</span>}
                    </Td>
                    <Td>{emp.active ? <Status tone="green">Active</Status> : <Status tone="red">Disabled</Status>}</Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        {emp.employeeCode ? (
                          <Link
                            to={`/attendance?code=${emp.employeeCode}`}
                            className="inline-flex h-8 items-center rounded-md border border-neutral-300 bg-white px-2.5 text-[13px] font-medium text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50"
                          >
                            Attendance
                          </Link>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={() => resetPassword(emp)}>
                          Reset password
                        </Button>
                        <Button size="sm" variant={emp.active ? "ghost" : "secondary"} onClick={() => toggleActive(emp)}>
                          {emp.active ? "Disable" : "Enable"}
                        </Button>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

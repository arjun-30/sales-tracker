import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import type { District, Employee } from "../lib/types";
import { Card, Badge, PageHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Label, Select } from "../components/ui/Input";

export function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
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

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api("/api/employees", {
        method: "POST",
        body: JSON.stringify({ name, phone, password, districtId }),
      });
      setName("");
      setPhone("");
      setPassword("");
      setShowForm(false);
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
    await api(`/api/employees/${emp.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !emp.active }),
    });
    refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Employees"
        description="Field staff accounts, their districts and whether they're on duty."
        actions={<Button onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : "Add employee"}</Button>}
      />

      {showForm && (
        <Card className="p-5">
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            <div>
              <Label>Temp password</Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} required />
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
            {error && <div className="sm:col-span-4 text-sm text-red-600">{error}</div>}
            <div className="sm:col-span-4">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create employee"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {notice && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            notice.tone === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </div>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Phone</th>
              <th className="px-5 py-3 font-medium">District</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Duty</th>
              <th className="px-5 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-5 py-10 text-center text-sm text-slate-400" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {employees.map((emp) => (
              <tr key={emp.id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70">
                <td className="px-5 py-3 font-medium text-slate-800">{emp.name}</td>
                <td className="px-5 py-3">{emp.phone}</td>
                <td className="px-5 py-3">{emp.district?.name ?? "—"}</td>
                <td className="px-5 py-3">
                  <Badge tone={emp.active ? "green" : "red"}>{emp.active ? "active" : "disabled"}</Badge>
                </td>
                <td className="px-5 py-3">
                  <Badge tone={emp.employeeLocation?.onDuty ? "blue" : "slate"}>
                    {emp.employeeLocation?.onDuty ? "on duty" : "off duty"}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-5 py-3 text-right">
                  <Button variant="ghost" onClick={() => resetPassword(emp)}>
                    Reset password
                  </Button>
                  <Button variant="ghost" onClick={() => toggleActive(emp)}>
                    {emp.active ? "Disable" : "Enable"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

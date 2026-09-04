import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import type { District, Employee } from "../lib/types";
import { Card, Badge } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Label, Select } from "../components/ui/Input";

export function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  async function toggleActive(emp: Employee) {
    await api(`/api/employees/${emp.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: !emp.active }),
    });
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Sales Employees</h1>
        <Button onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : "Add employee"}</Button>
      </div>

      {showForm && (
        <Card className="p-4">
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

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Phone</th>
              <th className="px-4 py-2">District</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Duty</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-4 py-6 text-center text-slate-400" colSpan={6}>
                  Loading…
                </td>
              </tr>
            )}
            {employees.map((emp) => (
              <tr key={emp.id} className="border-b border-slate-100">
                <td className="px-4 py-2 font-medium text-slate-800">{emp.name}</td>
                <td className="px-4 py-2">{emp.phone}</td>
                <td className="px-4 py-2">{emp.district?.name ?? "—"}</td>
                <td className="px-4 py-2">
                  <Badge tone={emp.active ? "green" : "red"}>{emp.active ? "active" : "disabled"}</Badge>
                </td>
                <td className="px-4 py-2">
                  <Badge tone={emp.employeeLocation?.onDuty ? "blue" : "slate"}>
                    {emp.employeeLocation?.onDuty ? "on duty" : "off duty"}
                  </Badge>
                </td>
                <td className="px-4 py-2 text-right">
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

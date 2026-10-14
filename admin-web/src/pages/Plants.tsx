import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Building2, Factory, Plus, ShieldCheck, Users } from "lucide-react";
import { api } from "../lib/api";
import type { Plant, PlantAdmin } from "../lib/types";
import { usePlant } from "../context/PlantContext";
import { Card, CardHeader, Notice, PageHeader, StatCard, Status } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Label, Select } from "../components/ui/Input";
import { MessageRow, Table, Td, Th, Tr } from "../components/ui/Table";

type NoticeState = { tone: "ok" | "error"; text: string } | null;

function PlantForm({
  plant,
  onDone,
  onCancel,
}: {
  plant: Plant | null;
  onDone: (message: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(plant?.name ?? "");
  const [code, setCode] = useState(plant?.code ?? "");
  const [address, setAddress] = useState(plant?.address ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const codeChanged = plant !== null && code !== plant.code;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (codeChanged && plant.employeeCount > 0) {
      const ok = window.confirm(
        `Change the code from ${plant.code} to ${code}? All ${plant.employeeCount} employee codes at this plant change too (RLX-${plant.code}-001 becomes RLX-${code}-001).`
      );
      if (!ok) return;
    }
    setSaving(true);
    setError(null);
    try {
      await api(plant ? `/api/plants/${plant.id}` : "/api/plants", {
        method: plant ? "PATCH" : "POST",
        body: JSON.stringify({ name, code, address: address || null }),
      });
      onDone(plant ? `${name} updated.` : `${name} added. Next, add its admin below.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the plant");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={plant ? `Edit ${plant.name}` : "New plant"}
        description="The code is part of every employee code at the plant, e.g. RLX-CHN-001."
      />
      <form onSubmit={submit} className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-4">
        <div className="sm:col-span-1">
          <Label>Plant name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Chennai Plant" required />
        </div>
        <div>
          <Label hint="2–5 letters">Code</Label>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 5))}
            placeholder="CHN"
            className="font-mono tracking-wider"
            minLength={2}
            required
          />
        </div>
        <div className="sm:col-span-2">
          <Label hint="Optional">Address</Label>
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Ambattur Industrial Estate, Chennai" />
        </div>
        {codeChanged && plant.employeeCount > 0 ? (
          <div className="sm:col-span-4">
            <Notice tone="warn">
              Changing the code renames the {plant.employeeCount} employee codes at this plant.
            </Notice>
          </div>
        ) : null}
        {error ? (
          <div className="sm:col-span-4">
            <Notice tone="error">{error}</Notice>
          </div>
        ) : null}
        <div className="flex gap-2 sm:col-span-4">
          <Button type="submit" disabled={saving || code.length < 2}>
            {saving ? "Saving…" : plant ? "Save changes" : "Create plant"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AdminForm({ plants, onDone, onCancel }: { plants: Plant[]; onDone: (message: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [plantId, setPlantId] = useState(plants[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const { admin } = await api<{ admin: PlantAdmin }>("/api/admins", {
        method: "POST",
        body: JSON.stringify({ name, phone, password, plantId }),
      });
      onDone(`${admin.name} can now log in to this panel with ${admin.phone} and sees only ${admin.plant?.name}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the admin");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 border-b border-neutral-200 bg-neutral-50 p-5 sm:grid-cols-2 lg:grid-cols-4">
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
          placeholder="98765 43210"
          required
        />
      </div>
      <div>
        <Label hint="8+ characters">Password</Label>
        <Input value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
      </div>
      <div>
        <Label>Plant</Label>
        <Select value={plantId} onChange={(e) => setPlantId(e.target.value)} required>
          {plants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.code})
            </option>
          ))}
        </Select>
      </div>
      {error ? (
        <div className="sm:col-span-2 lg:col-span-4">
          <Notice tone="error">{error}</Notice>
        </div>
      ) : null}
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="submit" disabled={saving || phone.length !== 10 || password.length < 8 || !plantId}>
          {saving ? "Creating…" : "Create admin"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function Plants() {
  const { isSuperAdmin, plants, reloadPlants, selectPlant } = usePlant();
  const navigate = useNavigate();
  const [admins, setAdmins] = useState<PlantAdmin[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [editing, setEditing] = useState<Plant | "new" | null>(null);
  const [addingAdmin, setAddingAdmin] = useState(false);
  const [notice, setNotice] = useState<NoticeState>(null);

  function loadAdmins() {
    setLoadingAdmins(true);
    api<{ admins: PlantAdmin[] }>("/api/admins")
      .then((d) => setAdmins(d.admins))
      .finally(() => setLoadingAdmins(false));
  }

  useEffect(() => {
    if (isSuperAdmin) {
      loadAdmins();
      reloadPlants();
    }
  }, [isSuperAdmin, reloadPlants]);

  if (!isSuperAdmin) return <Navigate to="/" replace />;

  const totalStaff = plants.reduce((sum, p) => sum + p.employeeCount, 0);
  const totalStores = plants.reduce((sum, p) => sum + p.storeCount, 0);

  async function deletePlant(plant: Plant) {
    if (!window.confirm(`Delete ${plant.name}? This can't be undone.`)) return;
    try {
      await api(`/api/plants/${plant.id}`, { method: "DELETE" });
      setNotice({ tone: "ok", text: `${plant.name} deleted.` });
      reloadPlants();
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Could not delete the plant" });
    }
  }

  async function updateAdmin(admin: PlantAdmin, changes: Partial<Pick<PlantAdmin, "active" | "plantId">>) {
    try {
      await api(`/api/admins/${admin.id}`, { method: "PATCH", body: JSON.stringify(changes) });
      loadAdmins();
      reloadPlants();
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Could not update the admin" });
    }
  }

  async function resetPassword(admin: PlantAdmin) {
    const password = window.prompt(`New password for ${admin.name} (at least 8 characters):`);
    if (password === null) return;
    if (password.length < 8) {
      setNotice({ tone: "error", text: "Admin passwords must be at least 8 characters." });
      return;
    }
    try {
      await api(`/api/admins/${admin.id}/password`, { method: "POST", body: JSON.stringify({ password }) });
      setNotice({ tone: "ok", text: `Password reset for ${admin.name}. Share it with them directly.` });
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Could not reset the password" });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Plants & Admins"
        description="Each plant has its own admins, salespeople, stores and prices. Plant admins only see their own plant."
        actions={
          editing === null ? (
            <Button onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4" /> Add plant
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Plants" value={plants.length} icon={Factory} accent />
        <StatCard label="Plant admins" value={admins.filter((a) => a.active).length} icon={ShieldCheck} hint="Active accounts" />
        <StatCard label="Sales staff" value={totalStaff} icon={Users} hint="Across all plants" />
        <StatCard label="Stores on the map" value={totalStores} icon={Building2} hint="Across all plants" />
      </div>

      {editing !== null ? (
        <PlantForm
          key={editing === "new" ? "new" : editing.id}
          plant={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onDone={(text) => {
            setEditing(null);
            setNotice({ tone: "ok", text });
            reloadPlants();
          }}
        />
      ) : null}

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <Card>
        <CardHeader title="Plants" description="Open a plant to see the whole panel for that plant only." />
        <Table>
          <thead>
            <tr>
              <Th>Code</Th>
              <Th>Plant</Th>
              <Th className="text-right">Admins</Th>
              <Th className="text-right">Sales staff</Th>
              <Th className="text-right">Stores</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {plants.length === 0 ? <MessageRow colSpan={6}>No plants yet. Add the first one.</MessageRow> : null}
            {plants.map((p) => {
              const empty = p.employeeCount + p.adminCount + p.storeCount === 0;
              return (
                <Tr key={p.id}>
                  <Td className="font-mono text-[13px] font-semibold tracking-wider text-neutral-900">{p.code}</Td>
                  <Td>
                    <div className="font-medium text-neutral-900">{p.name}</div>
                    {p.address ? <div className="text-xs text-neutral-500">{p.address}</div> : null}
                  </Td>
                  <Td className="text-right tabular-nums">
                    {p.adminCount || <span className="font-medium text-amber-700">None yet</span>}
                  </Td>
                  <Td className="text-right tabular-nums">{p.employeeCount}</Td>
                  <Td className="text-right tabular-nums">{p.storeCount}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="secondary" onClick={() => {
                          selectPlant(p.id);
                          navigate("/dashboard");
                        }}>
                        Open
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                        Edit
                      </Button>
                      {empty ? (
                        <Button size="sm" variant="ghost" onClick={() => deletePlant(p)}>
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </Card>

      <Card>
        <CardHeader
          title="Plant admins"
          description="They log in to this panel with their mobile number and manage their plant's staff, stores and prices."
          actions={
            !addingAdmin && plants.length > 0 ? (
              <Button size="sm" onClick={() => setAddingAdmin(true)}>
                <Plus className="h-4 w-4" /> Add admin
              </Button>
            ) : null
          }
        />
        {addingAdmin ? (
          <AdminForm
            plants={plants}
            onCancel={() => setAddingAdmin(false)}
            onDone={(text) => {
              setAddingAdmin(false);
              setNotice({ tone: "ok", text });
              loadAdmins();
              reloadPlants();
            }}
          />
        ) : null}
        <Table>
          <thead>
            <tr>
              <Th>Admin</Th>
              <Th>Plant</Th>
              <Th>Account</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loadingAdmins ? <MessageRow colSpan={4}>Loading admins…</MessageRow> : null}
            {!loadingAdmins && admins.length === 0 ? (
              <MessageRow colSpan={4}>No plant admins yet.</MessageRow>
            ) : null}
            {!loadingAdmins &&
              admins.map((a) => (
                <Tr key={a.id} className={a.active ? "" : "opacity-60"}>
                  <Td>
                    <div className="font-medium text-neutral-900">{a.name}</div>
                    <div className="text-xs tabular-nums text-neutral-500">{a.phone}</div>
                  </Td>
                  <Td>
                    <Select
                      value={a.plantId ?? ""}
                      onChange={(e) => {
                        const target = plants.find((p) => p.id === e.target.value);
                        if (target && window.confirm(`Move ${a.name} to ${target.name}? They will see only that plant.`)) {
                          updateAdmin(a, { plantId: target.id });
                        }
                      }}
                      className="h-8 max-w-56 text-[13px]"
                    >
                      {plants.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.code})
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td>{a.active ? <Status tone="green">Active</Status> : <Status tone="red">Disabled</Status>}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => resetPassword(a)}>
                        Reset password
                      </Button>
                      <Button
                        size="sm"
                        variant={a.active ? "ghost" : "secondary"}
                        onClick={() => {
                          if (a.active && !window.confirm(`Disable ${a.name}? They are logged out at once.`)) return;
                          updateAdmin(a, { active: !a.active });
                        }}
                      >
                        {a.active ? "Disable" : "Enable"}
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

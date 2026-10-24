import { useMemo, useEffect, useState, type FormEvent } from "react";
import { GoogleMap, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { Building2, CalendarPlus, FileSpreadsheet, MapPin, Phone, Plus, Search } from "lucide-react";
import { api } from "../lib/api";
import { formatDate } from "../lib/format";
import type { Store } from "../lib/types";
import { usePlant } from "../context/PlantContext";
import { Card, CardHeader, Notice, PageHeader, StatCard } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Label, Select } from "../components/ui/Input";
import { MessageRow, Table, Td, Th, Tr } from "../components/ui/Table";
import { StoreImport } from "../components/StoreImport";

const TAMIL_NADU_CENTER = { lat: 10.8284, lng: 78.7638 };

type LatLng = { lat: number; lng: number };

const mapsLink = (p: LatLng) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;

// Where the store is: paste a Google Maps link (or coordinates) and press
// Find, or click / drag the pin on the small map.
function LocationPicker({ value, onChange }: { value: LatLng | null; onChange: (p: LatLng) => void }) {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "" });
  const [link, setLink] = useState("");
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  useEffect(() => {
    if (map && value) {
      map.panTo(value);
      if ((map.getZoom() ?? 0) < 15) map.setZoom(16);
    }
  }, [map, value]);

  async function find() {
    setFinding(true);
    setError(null);
    try {
      const { location } = await api<{ location: LatLng }>("/api/stores/resolve-location", {
        method: "POST",
        body: JSON.stringify({ input: link }),
      });
      onChange(location);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that link");
    } finally {
      setFinding(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <Label hint="From WhatsApp or Google Maps › Share">Google Maps link or coordinates</Label>
        <div className="flex gap-2">
          <Input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (link.trim()) find();
              }
            }}
            placeholder="https://maps.app.goo.gl/…  or  13.0827, 80.2707"
          />
          <Button type="button" variant="secondary" onClick={find} disabled={!link.trim() || finding}>
            {finding ? "Finding…" : "Find"}
          </Button>
        </div>
        {error ? <p className="mt-1.5 text-xs text-red-600">{error}</p> : null}
      </div>
      <div className="h-64 overflow-hidden rounded-md border border-neutral-300 bg-neutral-100">
        {isLoaded ? (
          <GoogleMap
            mapContainerStyle={{ width: "100%", height: "100%" }}
            center={value ?? TAMIL_NADU_CENTER}
            zoom={value ? 16 : 7}
            onLoad={setMap}
            onUnmount={() => setMap(null)}
            onClick={(e) => e.latLng && onChange({ lat: e.latLng.lat(), lng: e.latLng.lng() })}
            options={{ disableDefaultUI: true, zoomControl: true, clickableIcons: false, gestureHandling: "greedy" }}
          >
            {value ? (
              <MarkerF
                position={value}
                draggable
                onDragEnd={(e) => e.latLng && onChange({ lat: e.latLng.lat(), lng: e.latLng.lng() })}
              />
            ) : null}
          </GoogleMap>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutral-400">Loading map…</div>
        )}
      </div>
      <p className="text-xs text-neutral-500">
        {value ? (
          <>
            Pinned at <span className="tabular-nums">{value.lat.toFixed(5)}, {value.lng.toFixed(5)}</span>. Drag the pin
            to adjust.
          </>
        ) : (
          "No position yet. Paste a link above, or click the map where the store is."
        )}
      </p>
    </div>
  );
}

function StoreForm({ store, onDone, onCancel }: { store: Store | null; onDone: (s: Store) => void; onCancel: () => void }) {
  const { isSuperAdmin, plants, plantId: viewing } = usePlant();
  const [plantId, setPlantId] = useState(store?.plantId ?? (viewing || plants[0]?.id || ""));
  const [name, setName] = useState(store?.name ?? "");
  const [ownerName, setOwnerName] = useState(store?.ownerName ?? "");
  const [phone, setPhone] = useState(store?.phone ?? "");
  const [address, setAddress] = useState(store?.address ?? "");
  const [notes, setNotes] = useState(store?.notes ?? "");
  const [position, setPosition] = useState<LatLng | null>(store ? { lat: store.lat, lng: store.lng } : null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!position) {
      setError("Place the store on the map first.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = {
        name,
        ownerName,
        phone,
        address,
        notes,
        lat: position.lat,
        lng: position.lng,
        ...(isSuperAdmin ? { plantId } : {}),
      };
      const { store: saved } = await api<{ store: Store }>(store ? `/api/stores/${store.id}` : "/api/stores", {
        method: store ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      onDone(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the store");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader
        title={store ? `Edit ${store.name}` : "New store"}
        description="It shows on the Live Map for this plant's admins and the super admin."
      />
      <form onSubmit={submit} className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-2">
        <div className="grid grid-cols-1 content-start gap-4 sm:grid-cols-2">
          {isSuperAdmin ? (
            <div className="sm:col-span-2">
              <Label>Plant</Label>
              <Select value={plantId} onChange={(e) => setPlantId(e.target.value)} required>
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <Label>Store name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sri Murugan Paints" required />
          </div>
          <div>
            <Label hint="Optional">Owner</Label>
            <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
          </div>
          <div>
            <Label hint={phone ? `${phone.length}/10` : "Optional"}>Mobile number</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
              inputMode="numeric"
              placeholder="98765 43210"
            />
          </div>
          <div className="sm:col-span-2">
            <Label hint="Optional">Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, area, town" />
          </div>
          <div className="sm:col-span-2">
            <Label hint="Optional">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Dealer since 2019, prefers morning visits" />
          </div>
        </div>
        <LocationPicker value={position} onChange={setPosition} />
        {error ? (
          <div className="lg:col-span-2">
            <Notice tone="error">{error}</Notice>
          </div>
        ) : null}
        <div className="flex gap-2 lg:col-span-2">
          <Button type="submit" disabled={saving || !name.trim() || (phone !== "" && phone.length !== 10)}>
            {saving ? "Saving…" : store ? "Save changes" : "Add store"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function Stores() {
  const { isSuperAdmin, plantId, plants } = usePlant();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Store | "new" | null>(null);
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const showPlant = isSuperAdmin && !plantId;

  function refresh() {
    setLoading(true);
    api<{ stores: Store[] }>("/api/stores")
      .then((d) => setStores(d.stores))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  // Shops salespeople added from the field wait here for approval.
  const pending = useMemo(() => stores.filter((s) => s.status === "pending"), [stores]);
  const approved = useMemo(() => stores.filter((s) => s.status === "approved"), [stores]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return approved;
    return approved.filter((s) =>
      [s.name, s.ownerName, s.phone, s.address, s.plant.name].some((v) => v?.toLowerCase().includes(q))
    );
  }, [approved, query]);

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const addedThisWeek = approved.filter((s) => new Date(s.createdAt).getTime() > weekAgo).length;
  const withPhone = approved.filter((s) => s.phone).length;

  async function approve(store: Store) {
    try {
      await api(`/api/stores/${store.id}/approve`, { method: "POST" });
      setStores((prev) => prev.map((s) => (s.id === store.id ? { ...s, status: "approved" } : s)));
      setNotice({ tone: "ok", text: `${store.name} approved. The whole team sees it on the map now.` });
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Could not approve the store" });
    }
  }

  async function remove(store: Store) {
    const question =
      store.status === "pending" ? `Reject ${store.name}? It is removed from the salesperson's map.` : `Remove ${store.name} from the map?`;
    if (!window.confirm(question)) return;
    try {
      await api(`/api/stores/${store.id}`, { method: "DELETE" });
      setStores((prev) => prev.filter((s) => s.id !== store.id));
      setNotice({ tone: "ok", text: `${store.name} removed.` });
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : "Could not remove the store" });
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stores"
        description="Shops and dealers on the Live Map. Paste a Google Maps link to place one, import a list from Excel, or approve the ones salespeople add from the field."
        actions={
          editing === null && !importing ? (
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setImporting(true)} disabled={isSuperAdmin && plants.length === 0}>
                <FileSpreadsheet className="h-4 w-4" /> Import from Excel
              </Button>
              <Button onClick={() => setEditing("new")} disabled={isSuperAdmin && plants.length === 0}>
                <Plus className="h-4 w-4" /> Add store
              </Button>
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Stores" value={approved.length} icon={Building2} hint="Pinned on the map" accent />
        <StatCard label="With a phone number" value={withPhone} icon={Phone} hint={`${approved.length - withPhone} without`} />
        <StatCard
          label="Added this week"
          value={addedThisWeek}
          icon={CalendarPlus}
          hint={pending.length ? `${pending.length} waiting for approval` : "Last 7 days"}
        />
      </div>

      {importing ? (
        <StoreImport
          onCancel={() => setImporting(false)}
          onDone={(created) => {
            setNotice({ tone: "ok", text: `${created} ${created === 1 ? "store" : "stores"} added from the file.` });
            refresh();
          }}
        />
      ) : null}

      {pending.length > 0 ? (
        <Card>
          <CardHeader
            title={`Waiting for approval · ${pending.length}`}
            description="Added by salespeople standing in the shop, pinned at their phone's position. Check the pin, then approve or reject."
          />
          <Table>
            <thead>
              <tr>
                <Th>Shop</Th>
                <Th>Phone</Th>
                <Th>Where</Th>
                <Th>Added by</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {pending.map((s) => (
                <Tr key={s.id}>
                  <Td>
                    <div className="font-medium text-neutral-900">{s.name}</div>
                    {s.ownerName ? <div className="text-xs text-neutral-500">{s.ownerName}</div> : null}
                  </Td>
                  <Td className="tabular-nums">{s.phone ?? <span className="text-neutral-400">—</span>}</Td>
                  <Td className="max-w-72">
                    <div className="truncate">{s.address ?? <span className="text-neutral-400">—</span>}</div>
                    <a
                      href={mapsLink(s)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                    >
                      <MapPin className="h-3 w-3" /> Check on Google Maps
                    </a>
                  </Td>
                  <Td>
                    <div>{s.createdBy?.name ?? "—"}</div>
                    <div className="text-xs text-neutral-500">{formatDate(s.createdAt)}</div>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" onClick={() => approve(s)}>
                        Approve
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(s)}>
                        Reject
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      ) : null}

      {editing !== null ? (
        <StoreForm
          key={editing === "new" ? "new" : editing.id}
          store={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onDone={(saved) => {
            setEditing(null);
            setNotice({ tone: "ok", text: `${saved.name} saved. It's on the Live Map now.` });
            refresh();
          }}
        />
      ) : null}

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-neutral-200 px-5 py-4">
          <div className="relative w-full sm:w-80">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search store, owner, phone or address"
              className="pl-9"
            />
          </div>
          <div className="ml-auto text-[13px] text-neutral-500">
            {visible.length} of {approved.length}
          </div>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Store</Th>
              <Th>Phone</Th>
              <Th>Address</Th>
              {showPlant ? <Th>Plant</Th> : null}
              <Th>Added</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {loading ? <MessageRow colSpan={showPlant ? 6 : 5}>Loading stores…</MessageRow> : null}
            {!loading && visible.length === 0 ? (
              <MessageRow colSpan={showPlant ? 6 : 5}>
                {approved.length ? "No store matches that search." : "No stores yet. Add the first one or import a list."}
              </MessageRow>
            ) : null}
            {!loading &&
              visible.map((s) => (
                <Tr key={s.id}>
                  <Td>
                    <div className="font-medium text-neutral-900">{s.name}</div>
                    {s.ownerName ? <div className="text-xs text-neutral-500">{s.ownerName}</div> : null}
                  </Td>
                  <Td className="tabular-nums">{s.phone ?? <span className="text-neutral-400">—</span>}</Td>
                  <Td className="max-w-72">
                    <div className="truncate">{s.address ?? <span className="text-neutral-400">—</span>}</div>
                    <a
                      href={mapsLink(s)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline"
                    >
                      <MapPin className="h-3 w-3" /> Google Maps
                    </a>
                  </Td>
                  {showPlant ? <Td>{s.plant.name}</Td> : null}
                  <Td>
                    <div>{formatDate(s.createdAt)}</div>
                    {s.createdBy ? <div className="text-xs text-neutral-500">by {s.createdBy.name}</div> : null}
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(s)}>
                        Remove
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

import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import type { Product, ProductShade } from "../lib/types";
import { Notice } from "./ui/Card";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";

// A product's colours, picked by the salesperson after the product code. The
// super admin keeps the list; a plant admin sees it. A shade switched off stays
// on old orders but can't be picked again.
export function ShadeEditor({
  product,
  canEdit,
  onChange,
}: {
  product: Product;
  canEdit: boolean;
  onChange: (shades: ProductShade[]) => void;
}) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [hex, setHex] = useState("#e8dcc4");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shades = product.shades ?? [];

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { shade } = await api<{ shade: ProductShade }>(`/api/products/${product.id}/shades`, {
        method: "POST",
        body: JSON.stringify({ name, code, hex, sortOrder: shades.length }),
      });
      onChange([...shades, shade]);
      setName("");
      setCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the shade");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(s: ProductShade) {
    setError(null);
    try {
      const { shade } = await api<{ shade: ProductShade }>(`/api/products/shades/${s.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !s.active }),
      });
      onChange(shades.map((x) => (x.id === shade.id ? shade : x)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the shade");
    }
  }

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-neutral-900">Shades</h3>
        <span className="text-xs text-neutral-500">
          {shades.filter((s) => s.active).length} offered · picked on the order after the product code
        </span>
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      {shades.length === 0 ? (
        <p className="text-[13px] text-neutral-500">
          No shades yet. {canEdit ? "Add the colours from the shade card below." : "The head office adds them."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {shades.map((s) => (
            <div
              key={s.id}
              className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[13px] ${
                s.active ? "border-neutral-300 bg-white" : "border-dashed border-neutral-300 bg-neutral-50 text-neutral-400"
              }`}
            >
              <span
                className="h-4 w-4 shrink-0 rounded-sm border border-black/10"
                style={{ backgroundColor: s.hex ?? "transparent" }}
              />
              <span className={s.active ? "text-neutral-900" : "line-through"}>{s.name}</span>
              {s.code ? <span className="font-mono text-xs text-neutral-500">{s.code}</span> : null}
              {canEdit ? (
                <button type="button" onClick={() => toggle(s)} className="ml-1 text-xs text-brand-700 hover:underline">
                  {s.active ? "Switch off" : "Offer again"}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {canEdit ? (
        <form onSubmit={add} className="mt-3 flex flex-wrap items-center gap-2">
          <div className="w-56">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Shade name, e.g. Ivory" />
          </div>
          <div className="w-28">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Card no." />
          </div>
          <input
            type="color"
            value={hex}
            onChange={(e) => setHex(e.target.value)}
            className="h-9 w-12 cursor-pointer rounded-md border border-neutral-300 bg-white p-1"
            aria-label="Swatch colour"
          />
          <Button type="submit" size="sm" disabled={busy || !name.trim()}>
            {busy ? "Adding…" : "Add shade"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

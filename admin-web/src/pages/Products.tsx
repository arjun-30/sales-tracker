import { Fragment, useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import type { Product, ProductVariant } from "../lib/types";
import { Card, PageHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Label } from "../components/ui/Input";

function VariantRow({ variant, onSaved }: { variant: ProductVariant; onSaved: (v: ProductVariant) => void }) {
  const [price, setPrice] = useState(String(variant.price));
  const [saving, setSaving] = useState(false);
  const dirty = Number(price) !== variant.price;

  async function save() {
    setSaving(true);
    try {
      const data = await api<{ variant: ProductVariant }>(`/api/products/variants/${variant.id}`, {
        method: "PATCH",
        body: JSON.stringify({ price: Number(price) }),
      });
      onSaved(data.variant);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2">
      <span className="w-14 shrink-0 text-sm font-semibold text-slate-700">{variant.sizeLabel}</span>
      <span className="text-slate-400">₹</span>
      <Input
        type="number"
        min="0"
        step="0.01"
        className="w-28"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />
      <Button variant="secondary" className="px-2 py-1 text-xs" disabled={!dirty || saving} onClick={save}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

export function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [category, setCategory] = useState("");

  function refresh() {
    setLoading(true);
    api<{ products: Product[] }>("/api/products")
      .then((d) => setProducts(d.products))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api("/api/products", {
        method: "POST",
        body: JSON.stringify({ name, shortCode, category }),
      });
      setName("");
      setShortCode("");
      setCategory("");
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create product");
    } finally {
      setSubmitting(false);
    }
  }

  function updateVariant(productId: string, variant: ProductVariant) {
    setProducts((prev) =>
      prev.map((p) =>
        p.id === productId ? { ...p, variants: p.variants.map((v) => (v.id === variant.id ? variant : v)) } : p
      )
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Product Catalog"
        description="Products, pack sizes and prices. Salespeople see active items in the app's Price List."
        actions={<Button onClick={() => setShowForm((s) => !s)}>{showForm ? "Cancel" : "Add product"}</Button>}
      />

      {showForm && (
        <Card className="p-5">
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label>Short code</Label>
              <Input
                value={shortCode}
                onChange={(e) => setShortCode(e.target.value.toUpperCase())}
                placeholder="RPE"
                required
              />
            </div>
            <div>
              <Label>Category</Label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} required />
            </div>
            {error && <div className="sm:col-span-4 text-sm text-red-600">{error}</div>}
            <div className="sm:col-span-4">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create product"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/80 text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Code</th>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Category</th>
              <th className="px-5 py-3 font-medium">Sizes</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td className="px-5 py-10 text-center text-sm text-slate-400" colSpan={5}>
                  Loading…
                </td>
              </tr>
            )}
            {products.map((p) => (
              <Fragment key={p.id}>
                <tr className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50/70">
                  <td className="px-5 py-3 font-mono font-semibold text-slate-800">{p.shortCode}</td>
                  <td className="px-5 py-3 font-medium text-slate-800">{p.name}</td>
                  <td className="px-5 py-3">{p.category}</td>
                  <td className="px-5 py-3 text-slate-500">{p.variants.length} size(s)</td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      onClick={() => setExpandedId((cur) => (cur === p.id ? null : p.id))}
                    >
                      {expandedId === p.id ? "Hide prices" : "Edit prices"}
                    </Button>
                  </td>
                </tr>
                {expandedId === p.id && (
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <td className="px-4 py-3" colSpan={5}>
                      <div className="flex flex-wrap gap-2">
                        {p.variants.map((v) => (
                          <VariantRow key={v.id} variant={v} onSaved={(nv) => updateVariant(p.id, nv)} />
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

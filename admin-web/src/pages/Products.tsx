import { Fragment, useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Layers, Package, Plus, Search } from "lucide-react";
import { api } from "../lib/api";
import { formatINR } from "../lib/format";
import type { Product, ProductVariant } from "../lib/types";
import { Card, CardHeader, Notice, PageHeader, StatCard, Tabs } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input, Label, Select } from "../components/ui/Input";
import { MessageRow, Table, Td, Th, Tr } from "../components/ui/Table";

type TabValue = "all" | "unpriced";

const isUnpriced = (v: ProductVariant) => v.active && v.price <= 0;

function PriceEditor({ product, onSaved }: { product: Product; onSaved: (variants: ProductVariant[]) => void }) {
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(product.variants.map((v) => [v.id, v.price > 0 ? String(v.price) : ""]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = product.variants.filter((v) => {
    const raw = draft[v.id];
    return raw !== "" && Number(raw) !== v.price;
  });
  const invalid = changed.some((v) => !(Number(draft[v.id]) > 0));

  async function saveAll() {
    setSaving(true);
    setError(null);
    try {
      const saved = await Promise.all(
        changed.map((v) =>
          api<{ variant: ProductVariant }>(`/api/products/variants/${v.id}`, {
            method: "PATCH",
            body: JSON.stringify({ price: Number(draft[v.id]) }),
          }).then((d) => d.variant)
        )
      );
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save prices");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {product.variants.map((v) => {
          const raw = draft[v.id];
          const missing = v.active && raw === "";
          return (
            <label key={v.id} className={`block ${v.active ? "" : "opacity-50"}`}>
              <span className="mb-1 flex items-baseline justify-between text-[13px] font-medium text-neutral-700">
                {v.sizeLabel}
                {!v.active ? <span className="text-xs font-normal text-neutral-400">hidden</span> : null}
                {missing ? <span className="text-xs font-normal text-red-600">no price</span> : null}
              </span>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">₹</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={raw}
                  placeholder="0.00"
                  onChange={(e) => setDraft((d) => ({ ...d, [v.id]: e.target.value }))}
                  className={`pl-7 tabular-nums ${missing ? "border-red-300" : ""}`}
                />
              </div>
            </label>
          );
        })}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={saveAll} disabled={changed.length === 0 || invalid || saving}>
          {saving ? "Saving…" : changed.length > 1 ? `Save ${changed.length} prices` : "Save price"}
        </Button>
        {invalid ? <span className="text-xs text-red-600">Prices must be more than ₹0.</span> : null}
        {!invalid && changed.length === 0 ? <span className="text-xs text-neutral-500">Edit a price to save it.</span> : null}
      </div>
    </div>
  );
}

export function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabValue>("all");
  const [query, setQuery] = useState("");
  const [category, setCategoryFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [newCategory, setNewCategory] = useState("");

  function refresh() {
    setLoading(true);
    api<{ products: Product[] }>("/api/products")
      .then((d) => setProducts(d.products))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  const categories = useMemo(() => [...new Set(products.map((p) => p.category))].sort(), [products]);
  const allSizes = products.flatMap((p) => p.variants.filter((v) => v.active));
  const unpricedSizes = allSizes.filter((v) => v.price <= 0).length;
  const productsMissing = products.filter((p) => p.variants.some(isUnpriced)).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (tab === "unpriced" && !p.variants.some(isUnpriced)) return false;
      if (category && p.category !== category) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.shortCode.toLowerCase().includes(q);
    });
  }, [products, tab, category, query]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api("/api/products", {
        method: "POST",
        body: JSON.stringify({ name, shortCode, category: newCategory }),
      });
      setName("");
      setShortCode("");
      setNewCategory("");
      setShowForm(false);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create product");
    } finally {
      setSubmitting(false);
    }
  }

  function applySaved(productId: string, saved: ProductVariant[]) {
    const byId = new Map(saved.map((v) => [v.id, v]));
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, variants: p.variants.map((v) => byId.get(v.id) ?? v) } : p))
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Products & Prices"
        description="The catalogue salespeople order from. A size can only be ordered once it has a price."
        actions={
          <Button onClick={() => setShowForm((s) => !s)} variant={showForm ? "secondary" : "primary"}>
            {showForm ? (
              "Close"
            ) : (
              <>
                <Plus className="h-4 w-4" /> Add product
              </>
            )}
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Products" value={products.length} icon={Package} hint={`${categories.length} categories`} />
        <StatCard label="Pack sizes" value={allSizes.length} icon={Layers} hint="Active sizes on sale" />
        <StatCard label="Sizes with a price" value={allSizes.length - unpricedSizes} icon={CheckCircle2} hint="Can be ordered" />
        <StatCard
          label="Sizes missing a price"
          icon={AlertCircle}
          value={<span className={unpricedSizes ? "text-red-600" : ""}>{unpricedSizes}</span>}
          hint={unpricedSizes ? `Across ${productsMissing} products. These can't be ordered.` : "Everything is priced."}
          accent={unpricedSizes > 0}
        />
      </div>

      {showForm && (
        <Card>
          <CardHeader title="New product" description="Add pack sizes and prices after creating it." />
          <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
            <div>
              <Label>Product name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label hint="Typed in the app to find it">Short code</Label>
              <Input
                value={shortCode}
                onChange={(e) => setShortCode(e.target.value.toUpperCase())}
                placeholder="RPE"
                className="font-mono"
                required
              />
            </div>
            <div>
              <Label>Category</Label>
              <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} list="categories" required />
              <datalist id="categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            {error && (
              <div className="sm:col-span-3">
                <Notice tone="error">{error}</Notice>
              </div>
            )}
            <div className="sm:col-span-3">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Creating…" : "Create product"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="px-5 pt-2">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[
              { value: "all", label: "All products", count: products.length },
              { value: "unpriced", label: "Missing prices", count: productsMissing },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or code" className="pl-9" />
          </div>
          <div className="w-full sm:w-52">
            <Select value={category} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div className="ml-auto text-[13px] text-neutral-500">
            {visible.length} {visible.length === 1 ? "product" : "products"}
          </div>
        </div>

        <Table>
          <thead>
            <tr>
              <Th className="w-8" />
              <Th>Code</Th>
              <Th>Product</Th>
              <Th>Category</Th>
              <Th>Sizes and prices</Th>
            </tr>
          </thead>
          <tbody>
            {loading && <MessageRow colSpan={5}>Loading products…</MessageRow>}
            {!loading && visible.length === 0 && <MessageRow colSpan={5}>No products match these filters.</MessageRow>}
            {!loading &&
              visible.map((p) => {
                const expanded = expandedId === p.id;
                const missing = p.variants.filter(isUnpriced).length;
                return (
                  <Fragment key={p.id}>
                    <Tr onClick={() => setExpandedId(expanded ? null : p.id)} className={expanded ? "bg-neutral-50" : ""}>
                      <Td className="pr-0 text-neutral-400">
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Td>
                      <Td className="font-mono text-[13px] font-semibold text-neutral-900">{p.shortCode}</Td>
                      <Td>
                        <div className="font-medium text-neutral-900">{p.name}</div>
                        {missing ? (
                          <div className="text-xs text-red-600">
                            {missing === p.variants.filter((v) => v.active).length
                              ? "No prices set"
                              : `${missing} of ${p.variants.filter((v) => v.active).length} sizes need a price`}
                          </div>
                        ) : null}
                      </Td>
                      <Td>{p.category}</Td>
                      <Td>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
                          {p.variants
                            .filter((v) => v.active)
                            .map((v) => (
                              <span key={v.id} className="whitespace-nowrap">
                                <span className="text-neutral-500">{v.sizeLabel}</span>{" "}
                                {v.price > 0 ? (
                                  <span className="font-medium tabular-nums text-neutral-900">{formatINR(v.price)}</span>
                                ) : (
                                  <span className="font-medium text-red-600">—</span>
                                )}
                              </span>
                            ))}
                        </div>
                      </Td>
                    </Tr>
                    {expanded && (
                      <tr className="border-b border-neutral-200 bg-neutral-50">
                        <td />
                        <td colSpan={4} className="px-4 pb-5 pt-2">
                          <PriceEditor product={p} onSaved={(saved) => applySaved(p.id, saved)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

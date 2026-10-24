import { useMemo, useState, type ChangeEvent } from "react";
import { readSheet } from "read-excel-file/browser";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { api } from "../lib/api";
import { usePlant } from "../context/PlantContext";
import { Card, CardHeader, Notice } from "./ui/Card";
import { Button } from "./ui/Button";
import { Label, Select } from "./ui/Input";

// The store fields a column can fill, with the header words that suggest it.
const FIELDS = [
  { key: "name", label: "Shop name", words: ["shop", "store", "dealer", "name", "firm", "outlet", "customer"] },
  { key: "ownerName", label: "Owner", words: ["owner", "contact person", "proprietor", "person"] },
  { key: "phone", label: "Phone", words: ["phone", "mobile", "cell", "contact no", "number", "whatsapp"] },
  { key: "address", label: "Address", words: ["address", "street", "area", "town", "city", "place"] },
  { key: "location", label: "Google Maps link", words: ["map", "link", "location", "gmap", "url", "coordinates"] },
  { key: "lat", label: "Latitude", words: ["latitude", "lat"] },
  { key: "lng", label: "Longitude", words: ["longitude", "lng", "long", "lon"] },
  { key: "notes", label: "Notes", words: ["note", "remark", "comment"] },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type Cell = string | number | null;

interface ImportResult {
  row: number;
  status: "created" | "skipped" | "error";
  name?: string;
  message?: string;
}

// Each field's column, from the header words: the most specific match wins,
// so "Owner name" goes to Owner, not Shop name.
function guessColumns(headers: string[]): Record<FieldKey, number> {
  const taken = new Set<number>();
  const result = {} as Record<FieldKey, number>;
  // Latitude/longitude and owner first: their words also appear in others ("long", "name").
  const order: FieldKey[] = ["lat", "lng", "ownerName", "phone", "location", "address", "notes", "name"];
  for (const key of order) {
    const field = FIELDS.find((f) => f.key === key)!;
    const idx = headers.findIndex((h, i) => {
      if (taken.has(i)) return false;
      const text = h.toLowerCase().trim();
      return field.words.some((w) => (w.length <= 4 ? text.split(/[^a-z]+/).includes(w) : text.includes(w)));
    });
    result[key] = idx;
    if (idx >= 0) taken.add(idx);
  }
  return result;
}

function toCell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim() || null;
}

// A small CSV reader: commas, quoted cells with "" escapes, CRLF or LF.
function parseCsv(text: string): Cell[][] {
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(toCell(cell));
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(toCell(cell));
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(toCell(cell));
    rows.push(row);
  }
  return rows;
}

const TEMPLATE =
  "Shop name,Owner,Phone,Address,Google Maps link,Latitude,Longitude,Notes\n" +
  'Sri Murugan Paints,Murugan,9876543210,"12 Bazaar St, Madurai",https://maps.app.goo.gl/...,,,\n' +
  "Lakshmi Hardware,Lakshmi,9123456780,Anna Nagar Chennai,,13.0850,80.2101,Dealer since 2019\n";

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "roalux-stores-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// Load a dealer list from Excel or CSV: pick the file, check which column is
// which, then import. Rows the server can't place come back with the reason.
export function StoreImport({ onCancel, onDone }: { onCancel: () => void; onDone: (created: number) => void }) {
  const { isSuperAdmin, plants, plantId: viewing } = usePlant();
  const [plantId, setPlantId] = useState(viewing || plants[0]?.id || "");
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Cell[][]>([]);
  const [columns, setColumns] = useState<Record<FieldKey, number> | null>(null);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ created: number; skipped: number; failed: number; results: ImportResult[] } | null>(
    null
  );

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setOutcome(null);
    setReading(true);
    try {
      const sheet = /\.csv$/i.test(file.name)
        ? parseCsv(await file.text())
        : (await readSheet(file)).map((r) => r.map(toCell));
      const nonEmpty = sheet.filter((r) => r.some((c) => c !== null));
      if (nonEmpty.length < 2) throw new Error("The file needs a header row and at least one shop.");
      const head = nonEmpty[0].map((c) => (c === null ? "" : String(c)));
      setFileName(file.name);
      setHeaders(head);
      setRows(nonEmpty.slice(1));
      setColumns(guessColumns(head));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read that file. Save it as .xlsx or .csv and try again.");
    } finally {
      setReading(false);
    }
  }

  const records = useMemo(() => {
    if (!columns) return [];
    return rows.map((r) =>
      Object.fromEntries(FIELDS.map((f) => [f.key, columns[f.key] >= 0 ? (r[columns[f.key]] ?? null) : null]))
    ) as Record<FieldKey, Cell>[];
  }, [rows, columns]);

  const hasName = columns ? columns.name >= 0 : false;
  const hasPlace = columns ? columns.location >= 0 || (columns.lat >= 0 && columns.lng >= 0) : false;

  async function runImport() {
    setImporting(true);
    setError(null);
    try {
      const res = await api<{ created: number; skipped: number; failed: number; results: ImportResult[] }>(
        "/api/stores/import",
        { method: "POST", body: JSON.stringify({ rows: records, ...(isSuperAdmin ? { plantId } : {}) }) }
      );
      setOutcome(res);
      if (res.created > 0) onDone(res.created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The import failed");
    } finally {
      setImporting(false);
    }
  }

  const problems = outcome?.results.filter((r) => r.status !== "created") ?? [];

  return (
    <Card>
      <CardHeader
        title="Import stores from Excel"
        description="One shop per row, with a Google Maps link or latitude and longitude for each. Shops already on the map are skipped."
        actions={
          <Button size="sm" variant="ghost" onClick={downloadTemplate}>
            <Download className="h-4 w-4" /> Template
          </Button>
        }
      />
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-end gap-4">
          {isSuperAdmin ? (
            <div className="w-56 space-y-1.5">
              <Label>Plant</Label>
              <Select value={plantId} onChange={(e) => setPlantId(e.target.value)}>
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          ) : null}
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50">
            <Upload className="h-4 w-4" />
            {reading ? "Reading…" : fileName ? "Choose another file" : "Choose .xlsx or .csv file"}
            <input type="file" accept=".xlsx,.csv" className="hidden" onChange={pickFile} disabled={reading} />
          </label>
          {fileName ? (
            <div className="inline-flex items-center gap-2 text-sm text-neutral-600">
              <FileSpreadsheet className="h-4 w-4" /> {fileName} · {rows.length} {rows.length === 1 ? "row" : "rows"}
            </div>
          ) : null}
        </div>

        {error ? <Notice tone="error">{error}</Notice> : null}

        {columns && !outcome ? (
          <>
            <div>
              <div className="mb-2 text-[13px] font-medium text-neutral-700">Which column is which</div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {FIELDS.map((f) => (
                  <div key={f.key} className="space-y-1">
                    <Label>{f.label}</Label>
                    <Select
                      value={columns[f.key]}
                      onChange={(e) => setColumns({ ...columns, [f.key]: Number(e.target.value) })}
                    >
                      <option value={-1}>Not in the file</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Column ${i + 1}`}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-neutral-200">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Row</th>
                    <th className="px-3 py-2 text-left">Shop</th>
                    <th className="px-3 py-2 text-left">Phone</th>
                    <th className="px-3 py-2 text-left">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-t border-neutral-100">
                      <td className="px-3 py-2 text-neutral-400">{i + 2}</td>
                      <td className="px-3 py-2 text-neutral-800">{r.name ?? <span className="text-red-600">No name</span>}</td>
                      <td className="px-3 py-2 tabular-nums text-neutral-600">{r.phone ?? "—"}</td>
                      <td className="max-w-72 truncate px-3 py-2 text-neutral-600">
                        {r.lat !== null && r.lng !== null
                          ? `${r.lat}, ${r.lng}`
                          : (r.location ?? <span className="text-red-600">No location</span>)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {records.length > 5 ? (
                <div className="border-t border-neutral-100 px-3 py-2 text-xs text-neutral-500">
                  and {records.length - 5} more rows
                </div>
              ) : null}
            </div>

            {!hasName || !hasPlace ? (
              <Notice tone="error">
                {!hasName ? "Choose the column with the shop name. " : ""}
                {!hasPlace ? "Choose a Google Maps link column, or both latitude and longitude." : ""}
              </Notice>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button onClick={runImport} disabled={!hasName || !hasPlace || importing || (isSuperAdmin && !plantId)}>
                {importing ? `Importing ${records.length} rows…` : `Import ${records.length} ${records.length === 1 ? "store" : "stores"}`}
              </Button>
            </div>
          </>
        ) : null}

        {outcome ? (
          <div className="space-y-3">
            <Notice tone={outcome.failed ? "warn" : "ok"}>
              {outcome.created} added to the map · {outcome.skipped} already there · {outcome.failed} could not be placed
            </Notice>
            {problems.length > 0 ? (
              <div className="max-h-80 overflow-y-auto rounded-md border border-neutral-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-neutral-50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Row</th>
                      <th className="px-3 py-2 text-left">Shop</th>
                      <th className="px-3 py-2 text-left">Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {problems.map((r) => (
                      <tr key={r.row} className="border-t border-neutral-100">
                        <td className="px-3 py-2 tabular-nums text-neutral-500">{r.row}</td>
                        <td className="px-3 py-2 text-neutral-800">{r.name ?? "—"}</td>
                        <td className={`px-3 py-2 ${r.status === "error" ? "text-red-700" : "text-neutral-500"}`}>{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onCancel}>
                Close
              </Button>
              {outcome.failed > 0 ? (
                <Button variant="secondary" onClick={() => setOutcome(null)}>
                  Fix columns and retry
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

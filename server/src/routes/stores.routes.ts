import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAdmin, requireAuth, requireRole } from "../middleware/auth";
import { plantFilter, targetPlantId } from "../lib/scope";
import { LocationNotFoundError, resolveLocation } from "../lib/mapsLink";
import { distanceM } from "../lib/geo";
import { emitToAdmins } from "../socket";

// Shops and dealers each plant supplies, shown on the admin map.
export const storesRouter = Router();

storesRouter.use(requireAuth);

const storeInclude = {
  plant: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

// Admins see their plant's stores (the super admin every plant's, or the one
// picked), approved or waiting; a salesperson sees their own plant's approved
// stores and the ones they added that are still waiting.
function storeScope(req: Request) {
  if (req.user!.role !== "sales_employee") return plantFilter(req);
  return {
    plantId: req.user!.plantId ?? "",
    OR: [{ status: "approved" as const }, { createdById: req.user!.sub }],
  };
}

storesRouter.get("/", async (req, res) => {
  const stores = await prisma.store.findMany({
    where: storeScope(req),
    include: storeInclude,
    orderBy: { name: "asc" },
  });
  res.json({ stores });
});

const resolveSchema = z.object({ input: z.string().trim().min(1).max(2000) });

// Coordinates from a pasted Google Maps link or typed position, for the
// admin's add-store form to preview before saving.
storesRouter.post("/resolve-location", requireAdmin, async (req, res) => {
  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Paste a Google Maps link or coordinates" });
  }
  try {
    res.json({ location: await resolveLocation(parsed.data.input) });
  } catch (err) {
    if (err instanceof LocationNotFoundError) return res.status(422).json({ error: err.message });
    throw err;
  }
});

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .nullable()
  .transform((v) => (v ? v : null));

const storeSchema = z.object({
  name: z.string().trim().min(1, "Enter the store name").max(200),
  ownerName: optionalText,
  phone: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{10}$/.test(v), "Phone number must be exactly 10 digits"),
  address: optionalText,
  notes: optionalText,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  plantId: z.string().optional(),
});

storesRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = storeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid store details" });
  }
  const { plantId: requested, ...data } = parsed.data;
  const store = await prisma.store.create({
    data: { ...data, plantId: targetPlantId(req, requested), createdById: req.user!.sub },
    include: storeInclude,
  });
  res.status(201).json({ store });
});

// A salesperson standing in a shop adds it at their phone's position. It
// waits for a plant admin to approve it before the rest of the team sees it.
storesRouter.post("/from-field", requireRole("sales_employee"), async (req, res) => {
  const parsed = storeSchema.omit({ plantId: true }).safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid shop details" });
  }
  if (!req.user!.plantId) return res.status(400).json({ error: "Your account is not linked to a plant" });
  const store = await prisma.store.create({
    data: { ...parsed.data, plantId: req.user!.plantId, status: "pending", createdById: req.user!.sub },
    include: storeInclude,
  });
  emitToAdmins(store.plantId, "store:pending", { storeId: store.id, name: store.name, addedBy: store.createdBy?.name });
  res.status(201).json({ store });
});

storesRouter.post("/:id/approve", requireAdmin, async (req, res) => {
  const existing = await findStore(req, req.params.id);
  if (!existing) return res.status(404).json({ error: "Store not found" });
  const store = await prisma.store.update({ where: { id: existing.id }, data: { status: "approved" }, include: storeInclude });
  res.json({ store });
});

const IMPORT_MAX_ROWS = 2000;
const cell = z.union([z.string(), z.number()]).optional().nullable();
const importSchema = z.object({
  plantId: z.string().optional(),
  rows: z
    .array(
      z.object({
        name: cell,
        ownerName: cell,
        phone: cell,
        address: cell,
        notes: cell,
        // A Google Maps link or "13.08, 80.27", or separate lat/lng columns.
        location: cell,
        lat: cell,
        lng: cell,
      })
    )
    .min(1, "The file has no rows")
    .max(IMPORT_MAX_ROWS, `Import at most ${IMPORT_MAX_ROWS} stores at a time`),
});

type ImportResult = { row: number; status: "created" | "skipped" | "error"; name?: string; message?: string };

// The same shop: the same name (ignoring case and punctuation) within 100 m.
const DUPLICATE_RADIUS_M = 100;
const nameKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const text = (v: string | number | null | undefined) => (v === null || v === undefined ? null : String(v).trim() || null);

// A dealer list from Excel, already read into rows by the admin panel. Each row
// is placed from its map link or coordinates; shops already on the map are
// skipped, so the same file can be imported again after fixing a few rows.
storesRouter.post("/import", requireAdmin, async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid import" });
  }
  const plantId = targetPlantId(req, parsed.data.plantId);
  const known = await prisma.store.findMany({ where: { plantId }, select: { name: true, lat: true, lng: true } });

  const rows = parsed.data.rows;
  const results: ImportResult[] = new Array(rows.length);

  async function importRow(i: number) {
    const row = rows[i];
    const rowNo = i + 2; // the spreadsheet row, after the header
    const phone = text(row.phone)?.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "") ?? null;
    const fields = storeSchema.omit({ plantId: true, lat: true, lng: true }).safeParse({
      name: text(row.name) ?? "",
      ownerName: text(row.ownerName),
      phone: phone || null,
      address: text(row.address),
      notes: text(row.notes),
    });
    const name = text(row.name) ?? undefined;
    if (!fields.success) {
      results[i] = { row: rowNo, status: "error", name, message: fields.error.issues[0]?.message };
      return;
    }

    let pos: { lat: number; lng: number };
    try {
      const lat = text(row.lat);
      const lng = text(row.lng);
      const location = lat && lng ? `${lat}, ${lng}` : text(row.location);
      if (!location) throw new LocationNotFoundError("No location: add a Google Maps link, or latitude and longitude");
      pos = await resolveLocation(location);
    } catch (err) {
      if (!(err instanceof LocationNotFoundError)) throw err;
      results[i] = { row: rowNo, status: "error", name, message: err.message };
      return;
    }

    const key = nameKey(fields.data.name);
    if (known.some((k) => nameKey(k.name) === key && distanceM(k, pos) <= DUPLICATE_RADIUS_M)) {
      results[i] = { row: rowNo, status: "skipped", name, message: "Already on the map" };
      return;
    }
    known.push({ name: fields.data.name, ...pos });
    await prisma.store.create({ data: { ...fields.data, ...pos, plantId, createdById: req.user!.sub } });
    results[i] = { row: rowNo, status: "created", name };
  }

  // A short map link needs a lookup each; a few at a time keeps a long list
  // quick without hammering Google.
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < rows.length) await importRow(next++);
    })
  );

  const count = (status: ImportResult["status"]) => results.filter((r) => r.status === status).length;
  res.json({ created: count("created"), skipped: count("skipped"), failed: count("error"), results });
});

async function findStore(req: Request, id: string) {
  return prisma.store.findFirst({ where: { id, ...plantFilter(req) } });
}

storesRouter.patch("/:id", requireAdmin, async (req, res) => {
  const parsed = storeSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid store details" });
  }
  const existing = await findStore(req, req.params.id);
  if (!existing) return res.status(404).json({ error: "Store not found" });

  const { plantId, ...data } = parsed.data;
  // Moving a store to another plant is the super admin's call.
  if (plantId && plantId !== existing.plantId && req.user!.role !== "super_admin") {
    return res.status(403).json({ error: "You can only manage your own plant" });
  }
  const store = await prisma.store.update({
    where: { id: existing.id },
    data: { ...data, ...(plantId ? { plantId } : {}) },
    include: storeInclude,
  });
  res.json({ store });
});

storesRouter.delete("/:id", requireAdmin, async (req, res) => {
  const existing = await findStore(req, req.params.id);
  if (!existing) return res.status(404).json({ error: "Store not found" });
  await prisma.store.delete({ where: { id: existing.id } });
  res.status(204).end();
});

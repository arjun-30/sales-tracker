import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { plantFilter, targetPlantId } from "../lib/scope";
import { LocationNotFoundError, resolveLocation } from "../lib/mapsLink";

// Shops and dealers each plant supplies, shown on the admin map.
export const storesRouter = Router();

storesRouter.use(requireAuth);

const storeInclude = {
  plant: { select: { id: true, name: true, code: true } },
  createdBy: { select: { id: true, name: true } },
} as const;

// Admins see their plant's stores (the super admin every plant's, or the one
// picked); a salesperson sees their own plant's.
function storeScope(req: Request) {
  return req.user!.role === "sales_employee" ? { plantId: req.user!.plantId ?? "" } : plantFilter(req);
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

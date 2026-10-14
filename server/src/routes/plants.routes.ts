import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAdmin, requireAuth, requireSuperAdmin } from "../middleware/auth";
import { PLANT_CODE_PATTERN } from "../lib/attendance";

export const plantsRouter = Router();

plantsRouter.use(requireAuth, requireAdmin);

// The super admin sees every plant; a plant admin only their own.
plantsRouter.get("/", async (req, res) => {
  const plants = await prisma.plant.findMany({
    where: req.user!.role === "super_admin" ? {} : { id: req.user!.plantId ?? "" },
    orderBy: { name: "asc" },
    include: {
      users: { where: { active: true }, select: { role: true } },
      _count: { select: { stores: true } },
    },
  });
  res.json({
    plants: plants.map(({ users, _count, ...p }) => ({
      ...p,
      adminCount: users.filter((u) => u.role === "admin").length,
      employeeCount: users.filter((u) => u.role === "sales_employee").length,
      storeCount: _count.stores,
    })),
  });
});

const plantSchema = z.object({
  name: z.string().trim().min(1, "Enter the plant name"),
  code: z
    .string()
    .trim()
    .transform((c) => c.toUpperCase())
    .refine((c) => PLANT_CODE_PATTERN.test(c), "Plant code must be 2–5 letters, like CHN")
    .refine((c) => c !== "RLX", "RLX is the company prefix; pick another code"),
  address: z.string().trim().optional().nullable(),
});

plantsRouter.post("/", requireSuperAdmin, async (req, res) => {
  const parsed = plantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid plant details" });
  }
  const plant = await prisma.plant.create({ data: parsed.data });
  res.status(201).json({ plant });
});

// Changing a plant's code renames its employee codes to match
// (RLX-MAIN-004 becomes RLX-CHN-004), so nobody keeps a code for a plant
// that no longer exists.
plantsRouter.patch("/:id", requireSuperAdmin, async (req, res) => {
  const parsed = plantSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid plant details" });
  }
  const existing = await prisma.plant.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Plant not found" });

  const plant = await prisma.$transaction(async (tx) => {
    const updated = await tx.plant.update({ where: { id: existing.id }, data: parsed.data });
    if (parsed.data.code && parsed.data.code !== existing.code) {
      const oldPrefix = `RLX-${existing.code}-`;
      await tx.$executeRaw`
        UPDATE "User"
           SET "employeeCode" = ${`RLX-${parsed.data.code}-`} || substring("employeeCode" FROM ${oldPrefix.length + 1}::int)
         WHERE "employeeCode" LIKE ${`${oldPrefix}%`}
      `;
    }
    return updated;
  });
  res.json({ plant });
});

// Only a plant nothing belongs to yet can be deleted, e.g. one added by mistake.
plantsRouter.delete("/:id", requireSuperAdmin, async (req, res) => {
  const id = req.params.id;
  const [users, orders, visits, stores] = await Promise.all([
    prisma.user.count({ where: { plantId: id } }),
    prisma.order.count({ where: { plantId: id } }),
    prisma.visit.count({ where: { plantId: id } }),
    prisma.store.count({ where: { plantId: id } }),
  ]);
  if (users + orders + visits + stores > 0) {
    return res.status(409).json({ error: "This plant has staff, stores or orders, so it can't be deleted" });
  }
  await prisma.plant.delete({ where: { id } });
  res.status(204).end();
});

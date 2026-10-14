import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireSuperAdmin } from "../middleware/auth";

// Plant admin accounts, managed by the super admin.
export const adminsRouter = Router();

adminsRouter.use(requireAuth, requireSuperAdmin);

const publicAdminFields = {
  id: true,
  name: true,
  phone: true,
  active: true,
  plantId: true,
  plant: { select: { id: true, name: true, code: true } },
  createdAt: true,
} as const;

adminsRouter.get("/", async (_req, res) => {
  const admins = await prisma.user.findMany({
    where: { role: "admin" },
    select: publicAdminFields,
    orderBy: [{ plant: { name: "asc" } }, { name: "asc" }],
  });
  res.json({ admins });
});

const createSchema = z.object({
  name: z.string().trim().min(1, "Enter a name"),
  phone: z.string().regex(/^\d{10}$/, "Phone number must be exactly 10 digits"),
  // Admin accounts see a whole plant's data, so they get a longer minimum
  // than salespeople.
  password: z.string().min(8, "Password must be at least 8 characters"),
  plantId: z.string().min(1, "Choose a plant"),
});

adminsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid admin details" });
  }
  const { name, phone, password, plantId } = parsed.data;
  if (await prisma.user.findUnique({ where: { phone } })) {
    return res.status(409).json({ error: "A user with this phone already exists" });
  }
  const admin = await prisma.user.create({
    data: { name, phone, plantId, role: "admin", passwordHash: await bcrypt.hash(password, 10) },
    select: publicAdminFields,
  });
  res.status(201).json({ admin });
});

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  plantId: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

adminsRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const existing = await prisma.user.findFirst({ where: { id: req.params.id, role: "admin" } });
  if (!existing) return res.status(404).json({ error: "Admin not found" });
  const admin = await prisma.user.update({
    where: { id: existing.id },
    data: parsed.data,
    select: publicAdminFields,
  });
  res.json({ admin });
});

const passwordSchema = z.object({ password: z.string().min(8) });

adminsRouter.post("/:id/password", async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  const existing = await prisma.user.findFirst({ where: { id: req.params.id, role: "admin" } });
  if (!existing) return res.status(404).json({ error: "Admin not found" });
  await prisma.user.update({
    where: { id: existing.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 10) },
  });
  res.status(204).end();
});

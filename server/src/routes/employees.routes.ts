import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

export const employeesRouter = Router();

employeesRouter.use(requireAuth, requireRole("admin"));

employeesRouter.get("/", async (_req, res) => {
  const employees = await prisma.user.findMany({
    where: { role: "sales_employee" },
    select: {
      id: true,
      name: true,
      phone: true,
      active: true,
      districtId: true,
      district: true,
      createdAt: true,
      employeeLocation: true,
    },
    orderBy: { createdAt: "desc" },
  });
  res.json({ employees });
});

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(4),
  password: z.string().min(4),
  districtId: z.string().min(1),
});

employeesRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, phone, password, districtId } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    return res.status(409).json({ error: "A user with this phone already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const employee = await prisma.user.create({
    data: { name, phone, passwordHash, districtId, role: "sales_employee" },
  });

  res.status(201).json({
    employee: { id: employee.id, name: employee.name, phone: employee.phone, districtId: employee.districtId },
  });
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  districtId: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

employeesRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const employee = await prisma.user.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  res.json({ employee });
});

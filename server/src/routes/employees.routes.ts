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

// Never send passwordHash back to a client.
const publicEmployeeFields = {
  id: true,
  name: true,
  phone: true,
  active: true,
  districtId: true,
  district: true,
  createdAt: true,
} as const;

// These routes manage sales employees only; admin accounts are out of reach.
async function findEmployee(id: string) {
  return prisma.user.findFirst({ where: { id, role: "sales_employee" }, select: { id: true } });
}

employeesRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (!(await findEmployee(req.params.id))) {
    return res.status(404).json({ error: "Employee not found" });
  }
  const employee = await prisma.user.update({
    where: { id: req.params.id },
    data: parsed.data,
    select: publicEmployeeFields,
  });
  res.json({ employee });
});

const passwordSchema = z.object({ password: z.string().min(4) });

// FR-EMP-03: an admin sets a new password when an employee forgets theirs.
// A phone that is already logged in stays logged in: refresh tokens are not
// revocable yet (System Design 3.1). To lock someone out, deactivate them.
employeesRouter.post("/:id/password", async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
  }
  if (!(await findEmployee(req.params.id))) {
    return res.status(404).json({ error: "Employee not found" });
  }
  await prisma.user.update({
    where: { id: req.params.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 10) },
  });
  res.status(204).end();
});

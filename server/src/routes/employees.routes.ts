import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { getIO } from "../socket";
import { endDutyNow } from "../lib/duty";
import {
  istStartOfDay,
  normalizeEmployeeCode,
  totalMinutes,
  workedByDay,
} from "../lib/attendance";

export const employeesRouter = Router();

employeesRouter.use(requireAuth, requireRole("admin"));

// Never send passwordHash back to a client.
const publicEmployeeFields = {
  id: true,
  name: true,
  phone: true,
  employeeCode: true,
  active: true,
  districtId: true,
  district: true,
  createdAt: true,
} as const;

employeesRouter.get("/", async (_req, res) => {
  const now = new Date();
  const todayStart = istStartOfDay(now);
  const [employees, todaySessions] = await Promise.all([
    prisma.user.findMany({
      where: { role: "sales_employee" },
      select: { ...publicEmployeeFields, employeeLocation: true },
      orderBy: { employeeCode: "asc" },
    }),
    prisma.dutySession.findMany({
      where: { OR: [{ endedAt: null }, { endedAt: { gt: todayStart } }], startedAt: { lt: now } },
      select: { userId: true, startedAt: true, endedAt: true },
    }),
  ]);

  const sessionsByUser = new Map<string, typeof todaySessions>();
  for (const s of todaySessions) {
    sessionsByUser.set(s.userId, [...(sessionsByUser.get(s.userId) ?? []), s]);
  }
  res.json({
    employees: employees.map((e) => ({
      ...e,
      minutesToday: totalMinutes(workedByDay(sessionsByUser.get(e.id) ?? [], todayStart, now, now)),
    })),
  });
});

const rangeSchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

// Hours worked by one employee, looked up by employee code (RLX001). Defaults
// to the last 7 days including today.
employeesRouter.get("/code/:code/attendance", async (req, res) => {
  const code = normalizeEmployeeCode(req.params.code);
  if (!code) {
    return res.status(400).json({ error: "Employee codes look like RLX001" });
  }
  const parsed = rangeSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "from and to must be ISO dates" });
  }

  const now = new Date();
  const to = parsed.data.to ? new Date(parsed.data.to) : now;
  const from = parsed.data.from
    ? new Date(parsed.data.from)
    : new Date(istStartOfDay(now).getTime() - 6 * 24 * 60 * 60 * 1000);
  if (from >= to) {
    return res.status(400).json({ error: "from must be before to" });
  }

  const employee = await prisma.user.findFirst({
    where: { employeeCode: code, role: "sales_employee" },
    select: { ...publicEmployeeFields, employeeLocation: { select: { onDuty: true, updatedAt: true } } },
  });
  if (!employee) {
    return res.status(404).json({ error: `No employee with code ${code}` });
  }

  const [sessions, orderAgg, visitCount] = await Promise.all([
    prisma.dutySession.findMany({
      where: {
        userId: employee.id,
        startedAt: { lt: to },
        OR: [{ endedAt: null }, { endedAt: { gt: from } }],
      },
      orderBy: { startedAt: "desc" },
    }),
    prisma.order.aggregate({
      where: { employeeId: employee.id, createdAt: { gte: from, lte: to }, status: { not: "cancelled" } },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.visit.count({ where: { employeeId: employee.id, checkInAt: { gte: from, lte: to } } }),
  ]);

  const days = workedByDay(sessions, from, to, now);
  const minutes = totalMinutes(days);
  res.json({
    employee,
    from,
    to,
    totalMinutes: minutes,
    daysWorked: days.length,
    averageMinutesPerDay: days.length ? Math.round(minutes / days.length) : 0,
    days,
    sessions: sessions.map((s) => {
      const end = s.endedAt ?? now;
      return {
        id: s.id,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        endReason: s.endReason,
        minutes: Math.round((end.getTime() - s.startedAt.getTime()) / 60000),
      };
    }),
    activity: {
      orders: orderAgg._count,
      sales: orderAgg._sum.totalAmount?.toNumber() ?? 0,
      visits: visitCount,
    },
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().regex(/^\d{10}$/, "Phone number must be exactly 10 digits"),
  password: z.string().min(4),
  districtId: z.string().min(1),
});

async function nextEmployeeCode(): Promise<string> {
  const rows = await prisma.user.findMany({
    where: { employeeCode: { startsWith: "RLX" } },
    select: { employeeCode: true },
  });
  const highest = rows.reduce((max, r) => Math.max(max, Number(r.employeeCode!.slice(3)) || 0), 0);
  return `RLX${String(highest + 1).padStart(3, "0")}`;
}

employeesRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ error: first ? first.message : "Invalid employee details" });
  }
  const { name, phone, password, districtId } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    return res.status(409).json({ error: "A user with this phone already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  // Two admins adding staff at the same moment can pick the same next code;
  // the unique index rejects the second, which then takes the following one.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const employee = await prisma.user.create({
        data: {
          name,
          phone,
          passwordHash,
          districtId,
          role: "sales_employee",
          employeeCode: await nextEmployeeCode(),
        },
        select: publicEmployeeFields,
      });
      return res.status(201).json({ employee });
    } catch (err) {
      const isCodeClash =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        String(err.meta?.target).includes("employeeCode");
      if (!isCodeClash) throw err;
    }
  }
  res.status(503).json({ error: "Could not assign an employee code; try again" });
});

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  districtId: z.string().min(1).optional(),
  active: z.boolean().optional(),
});

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

  // A disabled employee's phone may still hold a valid token, so take them off
  // duty here rather than leave them on the map with their hours running.
  if (parsed.data.active === false) {
    const location = await endDutyNow(employee.id, "deactivated");
    if (location) {
      getIO().to("role:admin").emit("employee:duty", {
        employeeId: employee.id,
        name: employee.name,
        districtId: employee.districtId,
        onDuty: false,
        lat: location.lat,
        lng: location.lng,
        updatedAt: location.updatedAt,
      });
    }
  }
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

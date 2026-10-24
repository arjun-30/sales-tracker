import { Router, type Request } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { emitToAdmins } from "../socket";
import { endDutyNow } from "../lib/duty";
import { HttpError, plantFilter, targetPlantId } from "../lib/scope";
import { distanceM } from "../lib/geo";
import {
  employeeCode,
  istStartOfDay,
  normalizeEmployeeCode,
  totalMinutes,
  workedByDay,
} from "../lib/attendance";

export const employeesRouter = Router();

employeesRouter.use(requireAuth, requireAdmin);

// Never send passwordHash back to a client.
const publicEmployeeFields = {
  id: true,
  name: true,
  phone: true,
  employeeCode: true,
  active: true,
  districtId: true,
  district: true,
  plantId: true,
  plant: { select: { id: true, name: true, code: true } },
  createdAt: true,
} as const;

employeesRouter.get("/", async (req, res) => {
  const now = new Date();
  const todayStart = istStartOfDay(now);
  const [employees, todaySessions] = await Promise.all([
    prisma.user.findMany({
      where: { role: "sales_employee", ...plantFilter(req) },
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
  plantId: z.string().optional(),
});

// Hours worked by one employee, looked up by employee code (RLX-CHN-001).
// Defaults to the last 7 days including today.
employeesRouter.get("/code/:code/attendance", async (req, res) => {
  const code = normalizeEmployeeCode(req.params.code);
  if (!code) {
    return res.status(400).json({ error: "Employee codes look like RLX-CHN-001" });
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
    where: { employeeCode: code, role: "sales_employee", ...plantFilter(req) },
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

// A stay this long in one spot is a stop worth showing on the day's route.
const STOP_MIN_MINUTES = 15;
const STOP_RADIUS_M = 150;
// Enough points to draw a day's route smoothly without a huge response.
const ROUTE_MAX_POINTS = 1500;

type Ping = { lat: number; lng: number; recordedAt: Date };

// Places the employee stayed at least STOP_MIN_MINUTES, from consecutive pings
// that stay within STOP_RADIUS_M of where the stay began.
function findStops(pings: Ping[]) {
  const stops: { lat: number; lng: number; from: Date; to: Date; minutes: number }[] = [];
  let start = 0;
  for (let i = 1; i <= pings.length; i++) {
    const left = i === pings.length || distanceM(pings[start], pings[i]) > STOP_RADIUS_M;
    if (!left) continue;
    const from = pings[start].recordedAt;
    const to = pings[i - 1].recordedAt;
    const minutes = Math.round((to.getTime() - from.getTime()) / 60000);
    if (minutes >= STOP_MIN_MINUTES) stops.push({ lat: pings[start].lat, lng: pings[start].lng, from, to, minutes });
    start = i;
  }
  return stops;
}

const routeQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD") });

// One employee's day (Indian time): the route their phone reported, where they
// stopped and for how long, and the orders and shop visits along the way.
employeesRouter.get("/code/:code/route", async (req, res) => {
  const code = normalizeEmployeeCode(req.params.code);
  if (!code) return res.status(400).json({ error: "Employee codes look like RLX-CHN-001" });
  const parsed = routeQuery.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message });

  const employee = await prisma.user.findFirst({
    where: { employeeCode: code, role: "sales_employee", ...plantFilter(req) },
    select: { id: true },
  });
  if (!employee) return res.status(404).json({ error: `No employee with code ${code}` });

  const from = new Date(`${parsed.data.date}T00:00:00+05:30`);
  const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);

  const [pings, orders, visits] = await Promise.all([
    prisma.locationHistory.findMany({
      where: { userId: employee.id, recordedAt: { gte: from, lt: to } },
      orderBy: { recordedAt: "asc" },
      select: { lat: true, lng: true, recordedAt: true },
    }),
    prisma.order.findMany({
      where: { employeeId: employee.id, createdAt: { gte: from, lt: to } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        customerName: true,
        shopName: true,
        totalAmount: true,
        status: true,
        channel: true,
        distanceFromStoreM: true,
        lat: true,
        lng: true,
        createdAt: true,
      },
    }),
    prisma.visit.findMany({
      where: { employeeId: employee.id, checkInAt: { gte: from, lt: to } },
      orderBy: { checkInAt: "asc" },
      select: { id: true, shopName: true, checkInAt: true, checkOutAt: true, checkInLat: true, checkInLng: true },
    }),
  ]);

  const step = Math.max(1, Math.ceil(pings.length / ROUTE_MAX_POINTS));
  const points = pings.filter((_, i) => i % step === 0 || i === pings.length - 1);
  let distance = 0;
  for (let i = 1; i < pings.length; i++) distance += distanceM(pings[i - 1], pings[i]);

  res.json({
    date: parsed.data.date,
    points: points.map((p) => ({ lat: p.lat, lng: p.lng, at: p.recordedAt })),
    stops: findStops(pings),
    distanceKm: Math.round(distance / 100) / 10,
    orders,
    visits,
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1),
  phone: z.string().regex(/^\d{10}$/, "Phone number must be exactly 10 digits"),
  password: z.string().min(4),
  districtId: z.string().min(1),
  // Required from the super admin; a plant admin always adds to their own plant.
  plantId: z.string().optional(),
});

// Codes are numbered per plant: RLX-CHN-001, RLX-CHN-002, …
async function nextEmployeeCode(plantId: string): Promise<string> {
  const plant = await prisma.plant.findUnique({ where: { id: plantId }, select: { code: true } });
  if (!plant) throw new HttpError(400, "Plant not found");
  const prefix = `RLX-${plant.code}-`;
  const rows = await prisma.user.findMany({
    where: { employeeCode: { startsWith: prefix } },
    select: { employeeCode: true },
  });
  const highest = rows.reduce((max, r) => Math.max(max, Number(r.employeeCode!.slice(prefix.length)) || 0), 0);
  return employeeCode(plant.code, highest + 1);
}

// Runs `write` with the plant's next free code. Two admins adding staff at the
// same moment can pick the same number; the unique index rejects the second,
// which then takes the following one.
async function withNextCode<T>(plantId: string, write: (code: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await write(await nextEmployeeCode(plantId));
    } catch (err) {
      const isCodeClash =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        String(err.meta?.target).includes("employeeCode");
      if (!isCodeClash) throw err;
    }
  }
  throw new HttpError(503, "Could not assign an employee code; try again");
}

employeesRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res.status(400).json({ error: first ? first.message : "Invalid employee details" });
  }
  const { name, phone, password, districtId } = parsed.data;
  const plantId = targetPlantId(req, parsed.data.plantId);

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    return res.status(409).json({ error: "A user with this phone already exists" });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const employee = await withNextCode(plantId, (code) =>
    prisma.user.create({
      data: { name, phone, passwordHash, districtId, plantId, role: "sales_employee", employeeCode: code },
      select: publicEmployeeFields,
    })
  );
  res.status(201).json({ employee });
});

const updateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  districtId: z.string().min(1).optional(),
  active: z.boolean().optional(),
  // Moves the employee to another plant (super admin only). They get a code at
  // the new plant; orders and visits they already logged stay with the old one.
  plantId: z.string().min(1).optional(),
});

// These routes manage sales employees only, and a plant admin only those of
// their own plant: anyone else is "not found".
async function findEmployee(req: Request, id: string) {
  return prisma.user.findFirst({
    where: { id, role: "sales_employee", ...plantFilter(req) },
    select: { id: true, plantId: true },
  });
}

employeesRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const existing = await findEmployee(req, req.params.id);
  if (!existing) {
    return res.status(404).json({ error: "Employee not found" });
  }
  const { plantId, ...changes } = parsed.data;
  const transfer = plantId !== undefined && plantId !== existing.plantId;
  if (transfer && req.user!.role !== "super_admin") {
    return res.status(403).json({ error: "Only the super admin can move staff to another plant" });
  }
  const employee = transfer
    ? await withNextCode(plantId, (code) =>
        prisma.user.update({
          where: { id: req.params.id },
          data: { ...changes, plantId, employeeCode: code },
          select: publicEmployeeFields,
        })
      )
    : await prisma.user.update({ where: { id: req.params.id }, data: changes, select: publicEmployeeFields });

  // A disabled employee's phone may still hold a valid token, so take them off
  // duty here rather than leave them on the map with their hours running.
  if (parsed.data.active === false) {
    const location = await endDutyNow(employee.id, "deactivated");
    if (location) {
      emitToAdmins(employee.plantId, "employee:duty", {
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
// A phone that is already logged in stays logged in. To lock someone out,
// deactivate them: that takes effect on their next request.
employeesRouter.post("/:id/password", async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Password must be at least 4 characters" });
  }
  if (!(await findEmployee(req, req.params.id))) {
    return res.status(404).json({ error: "Employee not found" });
  }
  await prisma.user.update({
    where: { id: req.params.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 10) },
  });
  res.status(204).end();
});

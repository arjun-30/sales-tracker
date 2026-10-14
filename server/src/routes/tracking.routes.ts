import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { getIO } from "../socket";
import { closeDuty, startDutySession } from "../lib/duty";
import { istStartOfDay, totalMinutes, workedByDay } from "../lib/attendance";

export const trackingRouter = Router();

trackingRouter.use(requireAuth);

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
});

trackingRouter.patch("/location", requireRole("sales_employee"), async (req, res) => {
  const parsed = locationSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { lat, lng, accuracy } = parsed.data;
  const userId = req.user!.sub;

  // Only on-duty employees may move their pin. A background tick that lands
  // after POST /duty {onDuty:false} must not flip them back on duty, so the
  // onDuty check and the write are one conditional update.
  const location = await prisma.$transaction(async (tx) => {
    const { count } = await tx.employeeLocation.updateMany({
      where: { userId, onDuty: true },
      data: { lat, lng, accuracy },
    });
    if (count === 0) return null;
    await tx.locationHistory.create({ data: { userId, lat, lng, accuracy } });
    return tx.employeeLocation.findUniqueOrThrow({ where: { userId } });
  });
  if (!location) {
    return res.status(409).json({ error: "Not on duty" });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, districtId: true },
  });

  getIO().to("role:admin").emit("employee:location", {
    employeeId: userId,
    name: user?.name,
    districtId: user?.districtId,
    lat,
    lng,
    accuracy,
    onDuty: true,
    updatedAt: location.updatedAt,
  });

  res.json({ location });
});

const dutySchema = z.object({
  onDuty: z.boolean(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

trackingRouter.post("/duty", requireRole("sales_employee"), async (req, res) => {
  const parsed = dutySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { onDuty, lat, lng } = parsed.data;
  const userId = req.user!.sub;

  // The on/off flag and the duty session that hours are counted from change
  // together, so the two can never disagree.
  const location = await prisma.$transaction(async (tx) => {
    const updated = await tx.employeeLocation.upsert({
      where: { userId },
      update: {
        onDuty,
        ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
      },
      create: { userId, onDuty, lat: lat ?? 0, lng: lng ?? 0 },
    });
    if (onDuty) await startDutySession(tx, userId);
    else await closeDuty(tx, userId, "manual");
    return updated;
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, districtId: true },
  });

  getIO().to("role:admin").emit("employee:duty", {
    employeeId: userId,
    name: user?.name,
    districtId: user?.districtId,
    onDuty,
    lat: location.lat,
    lng: location.lng,
    updatedAt: location.updatedAt,
  });

  res.json({ location });
});

trackingRouter.get("/live", requireRole("admin"), async (_req, res) => {
  const locations = await prisma.employeeLocation.findMany({
    where: { onDuty: true },
    include: { user: { select: { id: true, name: true, districtId: true, district: true } } },
  });
  res.json({ locations });
});

// The employee's own duty status for the app's profile screen: whether they
// are on duty, since when, and how long they have worked today (IST day).
trackingRouter.get("/me", requireRole("sales_employee"), async (req, res) => {
  const userId = req.user!.sub;
  const now = new Date();
  const todayStart = istStartOfDay(now);
  const [location, sessions] = await Promise.all([
    prisma.employeeLocation.findUnique({ where: { userId }, select: { onDuty: true } }),
    prisma.dutySession.findMany({
      where: { userId, startedAt: { lt: now }, OR: [{ endedAt: null }, { endedAt: { gt: todayStart } }] },
      orderBy: { startedAt: "asc" },
    }),
  ]);
  const open = sessions.find((s) => s.endedAt === null);
  res.json({
    onDuty: location?.onDuty ?? false,
    since: location?.onDuty ? (open?.startedAt ?? null) : null,
    minutesToday: totalMinutes(workedByDay(sessions, todayStart, now, now)),
  });
});

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAdmin, requireAuth, requireRole } from "../middleware/auth";
import { emitToAdmins } from "../socket";
import { plantFilter } from "../lib/scope";
import { closeDuty, startDutySession } from "../lib/duty";
import { istStartOfDay, totalMinutes, workedByDay } from "../lib/attendance";
import { distanceM } from "../lib/geo";

export const trackingRouter = Router();

trackingRouter.use(requireAuth);

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().optional(),
});

// Phone GPS wanders by tens of metres even when lying still, so moves inside
// this radius don't count as having left the spot.
const STATIONARY_RADIUS_M = 150;

// The anchor stays, and with it the "still since" time, while the employee is
// within the radius of it; a move further away starts a new stay from here.
function stationaryUpdate(
  current: { anchorLat: number | null; anchorLng: number | null; stationarySince: Date | null } | null,
  pos: { lat: number; lng: number }
) {
  const anchored =
    current?.anchorLat != null && current.anchorLng != null && current.stationarySince != null
      ? distanceM({ lat: current.anchorLat, lng: current.anchorLng }, pos) <= STATIONARY_RADIUS_M
      : false;
  return anchored ? {} : { anchorLat: pos.lat, anchorLng: pos.lng, stationarySince: new Date() };
}

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
    const current = await tx.employeeLocation.findUnique({
      where: { userId },
      select: { anchorLat: true, anchorLng: true, stationarySince: true },
    });
    const { count } = await tx.employeeLocation.updateMany({
      where: { userId, onDuty: true },
      data: { lat, lng, accuracy, ...stationaryUpdate(current, { lat, lng }) },
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
    select: { id: true, name: true, districtId: true, plantId: true },
  });

  emitToAdmins(user?.plantId ?? null, "employee:location", {
    employeeId: userId,
    name: user?.name,
    districtId: user?.districtId,
    lat,
    lng,
    accuracy,
    onDuty: true,
    stationarySince: location.stationarySince,
    updatedAt: location.updatedAt,
  });

  res.json({ location });
});

const dutySchema = z.object({
  onDuty: z.boolean(),
  // Typed by the employee to confirm, so going on or off duty is always a
  // deliberate act they can't later say happened by accident.
  employeeCode: z.string({ required_error: "Enter your employee code to confirm" }).trim().min(1, "Enter your employee code to confirm"),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

// "rlx chn 001", "RLX-CHN-001" and "rlxchn001" are the same code.
const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "");

trackingRouter.post("/duty", requireRole("sales_employee"), async (req, res) => {
  const parsed = dutySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid duty request" });
  }
  const { onDuty, employeeCode, lat, lng } = parsed.data;
  const userId = req.user!.sub;

  const me = await prisma.user.findUnique({ where: { id: userId }, select: { employeeCode: true } });
  if (me?.employeeCode && normalizeCode(me.employeeCode) !== normalizeCode(employeeCode)) {
    return res.status(403).json({ error: "That isn't your employee code. Check it on your ID or ask the office." });
  }

  // The on/off flag and the duty session that hours are counted from change
  // together, so the two can never disagree.
  const location = await prisma.$transaction(async (tx) => {
    const hasPos = lat !== undefined && lng !== undefined;
    // A new shift starts its "still since" clock here; off duty there is none.
    const stay = onDuty
      ? { anchorLat: hasPos ? lat : null, anchorLng: hasPos ? lng : null, stationarySince: hasPos ? new Date() : null }
      : { anchorLat: null, anchorLng: null, stationarySince: null };
    const updated = await tx.employeeLocation.upsert({
      where: { userId },
      update: { onDuty, ...(hasPos ? { lat, lng } : {}), ...stay },
      create: { userId, onDuty, lat: lat ?? 0, lng: lng ?? 0, ...stay },
    });
    if (onDuty) await startDutySession(tx, userId);
    else await closeDuty(tx, userId, "manual");
    return updated;
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, districtId: true, plantId: true },
  });

  emitToAdmins(user?.plantId ?? null, "employee:duty", {
    employeeId: userId,
    name: user?.name,
    districtId: user?.districtId,
    onDuty,
    stationarySince: location.stationarySince,
    lat: location.lat,
    lng: location.lng,
    updatedAt: location.updatedAt,
  });

  res.json({ location });
});

trackingRouter.get("/live", requireAdmin, async (req, res) => {
  const locations = await prisma.employeeLocation.findMany({
    where: { onDuty: true, user: plantFilter(req) },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          employeeCode: true,
          districtId: true,
          district: true,
          plantId: true,
          plant: { select: { id: true, name: true, code: true } },
        },
      },
    },
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

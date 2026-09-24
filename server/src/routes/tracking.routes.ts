import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { getIO } from "../socket";

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

  const existing = await prisma.employeeLocation.findUnique({ where: { userId } });
  const location = await prisma.employeeLocation.upsert({
    where: { userId },
    update: {
      onDuty,
      ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
    },
    create: {
      userId,
      onDuty,
      lat: lat ?? existing?.lat ?? 0,
      lng: lng ?? existing?.lng ?? 0,
    },
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

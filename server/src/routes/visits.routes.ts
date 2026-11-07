import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { plantFilter } from "../lib/scope";
import { inBackground } from "../lib/messaging";
import { notifyVisitEnded } from "../lib/notify";

export const visitsRouter = Router();

visitsRouter.use(requireAuth);

// A shop on the plant's map (storeId), whose owner hears how the visit went,
// or one typed by name (older app builds).
const checkInSchema = z.object({
  storeId: z.string().min(1).optional(),
  shopName: z.string().min(1).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  notes: z.string().optional(),
});

visitsRouter.post("/checkin", requireRole("sales_employee"), async (req, res) => {
  const parsed = checkInSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const employeeId = req.user!.sub;

  const openVisit = await prisma.visit.findFirst({
    where: { employeeId, checkOutAt: null },
  });
  if (openVisit) {
    return res.status(409).json({ error: "You already have an open visit. Check out first." });
  }

  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    include: { employeeLocation: { select: { onDuty: true } } },
  });
  if (!employee?.districtId) {
    return res.status(400).json({ error: "Employee has no district assigned" });
  }
  if (!employee.plantId) {
    return res.status(400).json({ error: "Employee has no plant assigned" });
  }
  // Visits count towards the working day, so they only happen on duty.
  if (!employee.employeeLocation?.onDuty) {
    return res.status(409).json({ error: "Go on duty before checking in to a shop." });
  }

  const { storeId, lat, lng, notes } = parsed.data;
  // A shop of the salesperson's plant: approved, or one they added themselves.
  const store = storeId
    ? await prisma.store.findFirst({
        where: { id: storeId, plantId: employee.plantId, OR: [{ status: "approved" }, { createdById: employeeId }] },
        select: { id: true, name: true },
      })
    : null;
  if (storeId && !store) return res.status(400).json({ error: "That shop is not on your plant's map" });
  const shopName = store?.name ?? parsed.data.shopName?.trim();
  if (!shopName) return res.status(400).json({ error: "Pick the shop you are visiting" });

  const visit = await prisma.visit.create({
    data: {
      employeeId,
      districtId: employee.districtId,
      plantId: employee.plantId,
      storeId: store?.id,
      shopName,
      checkInLat: lat,
      checkInLng: lng,
      notes,
    },
  });

  res.status(201).json({ visit });
});

const checkOutSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

visitsRouter.post("/:id/checkout", requireRole("sales_employee"), async (req, res) => {
  const parsed = checkOutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const visit = await prisma.visit.findUnique({ where: { id: req.params.id } });
  if (!visit || visit.employeeId !== req.user!.sub) {
    return res.status(404).json({ error: "Visit not found" });
  }
  if (visit.checkOutAt) {
    return res.status(409).json({ error: "Visit already checked out" });
  }

  const updated = await prisma.visit.update({
    where: { id: visit.id },
    data: { checkOutAt: new Date(), checkOutLat: parsed.data.lat, checkOutLng: parsed.data.lng },
  });

  res.json({ visit: updated });
  // No order at the shop during the visit: the owner and the admins hear so.
  inBackground(() => notifyVisitEnded(updated.id));
});

const listQuerySchema = z.object({
  employeeId: z.string().optional(),
  districtId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

visitsRouter.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { employeeId, districtId, from, to } = parsed.data;

  const where: Record<string, unknown> = {};
  if (req.user!.role === "sales_employee") {
    where.employeeId = req.user!.sub;
  } else {
    Object.assign(where, plantFilter(req));
    if (employeeId) where.employeeId = employeeId;
  }
  if (districtId) where.districtId = districtId;
  if (from || to) {
    where.checkInAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const visits = await prisma.visit.findMany({
    where,
    include: {
      employee: { select: { id: true, name: true } },
      district: true,
      plant: { select: { id: true, name: true, code: true } },
    },
    orderBy: { checkInAt: "desc" },
  });

  res.json({ visits });
});

import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";
import { plantFilter } from "../lib/scope";
import { inBackground } from "../lib/messaging";
import { notifyPaymentReceived, notifyVisitEnded } from "../lib/notify";
import { istDateKey } from "../lib/attendance";

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

const checkOutSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    // Payment taken at the shop. Optional: older app builds send none.
    paymentAmount: z.number().nonnegative().max(100_000_000).optional(),
    paymentMode: z.enum(["cash", "upi", "cheque", "bank_transfer", "credit"]).optional(),
    paymentRef: z.string().trim().max(60).optional(),
    // When to come back, YYYY-MM-DD.
    nextVisitOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the next visit date")
      .optional(),
    // Send the owner the visit (and payment) SMS.
    notifyOwner: z.boolean().default(true),
  })
  .refine((b) => !b.paymentAmount || b.paymentMode, { message: "Choose how the shop paid", path: ["paymentMode"] })
  .refine((b) => b.paymentMode !== "cheque" || b.paymentRef, { message: "Enter the cheque number", path: ["paymentRef"] });

visitsRouter.post("/:id/checkout", requireRole("sales_employee"), async (req, res) => {
  const parsed = checkOutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid checkout" });
  }
  const { lat, lng, paymentAmount, paymentMode, paymentRef, nextVisitOn, notifyOwner } = parsed.data;
  const nextVisitDate = nextVisitOn ? new Date(`${nextVisitOn}T00:00:00.000Z`) : null;
  if (nextVisitDate && (isNaN(nextVisitDate.getTime()) || nextVisitOn! <= istDateKey(new Date()))) {
    return res.status(400).json({ error: "The next visit has to be after today" });
  }
  const visit = await prisma.visit.findUnique({ where: { id: req.params.id } });
  if (!visit || visit.employeeId !== req.user!.sub) {
    return res.status(404).json({ error: "Visit not found" });
  }
  if (visit.checkOutAt) {
    return res.status(409).json({ error: "Visit already checked out" });
  }

  const paid = paymentAmount && paymentAmount > 0 ? paymentAmount : null;
  const updated = await prisma.$transaction(async (tx) => {
    const v = await tx.visit.update({
      where: { id: visit.id },
      data: {
        checkOutAt: new Date(),
        checkOutLat: lat,
        checkOutLng: lng,
        paymentAmount: paid,
        paymentMode: paid || paymentMode === "credit" ? paymentMode : null,
        paymentRef: paid ? paymentRef || null : null,
        nextVisitOn: nextVisitDate,
        notifyOwner,
      },
    });
    // The shop remembers when it is next due, for the map and the office.
    if (v.storeId && nextVisitDate) {
      await tx.store.update({ where: { id: v.storeId }, data: { nextVisitOn: nextVisitDate } });
    }
    return v;
  });

  res.json({ visit: updated });
  // No order at the shop during the visit: the owner and the admins hear so.
  inBackground(() => notifyVisitEnded(updated.id));
  if (paid) inBackground(() => notifyPaymentReceived(updated.id));
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

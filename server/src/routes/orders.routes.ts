import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { requireAdmin, requireAuth, requireRole } from "../middleware/auth";
import { plantPriceMap } from "../lib/prices";
import { plantFilter } from "../lib/scope";

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

const createSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  shopName: z.string().optional(),
  notes: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().min(1),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
});

ordersRouter.post("/", requireRole("sales_employee"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { customerName, customerPhone, shopName, notes, lat, lng, items } = parsed.data;
  const employeeId = req.user!.sub;

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
  // Orders are field work: they count towards the working day and are placed
  // where the employee is, so they can only be taken on duty.
  if (!employee.employeeLocation?.onDuty) {
    return res.status(409).json({ error: "Start duty before taking an order." });
  }

  const variantIds = items.map((i) => i.variantId);
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds }, active: true, product: { active: true } },
  });
  if (variants.length !== new Set(variantIds).size) {
    return res.status(400).json({ error: "One or more product sizes are not found or no longer available" });
  }

  // The salesperson's plant price where it has one, else the company price.
  const plantPrices = await plantPriceMap(employee.plantId);
  const priceById = new Map(variants.map((v) => [v.id, plantPrices.get(v.id) ?? v.price]));

  // An unpriced size would make a ₹0 order the office then has to chase.
  const unpriced = variants.filter((v) => priceById.get(v.id)!.lte(0));
  if (unpriced.length > 0) {
    const names = await prisma.productVariant.findMany({
      where: { id: { in: unpriced.map((v) => v.id) } },
      select: { sizeLabel: true, product: { select: { name: true } } },
    });
    return res.status(400).json({
      error: `No price set yet for ${names.map((n) => `${n.product.name} (${n.sizeLabel})`).join(", ")}. Ask the office to set it.`,
    });
  }

  const orderItems = items.map((i) => ({
    variantId: i.variantId,
    quantity: i.quantity,
    unitPrice: priceById.get(i.variantId)!,
  }));
  // Decimal arithmetic, so paise never drift the way floating point does.
  const totalAmount = orderItems.reduce((sum, i) => sum.add(i.unitPrice.mul(i.quantity)), new Prisma.Decimal(0));

  const order = await prisma.order.create({
    data: {
      employeeId,
      districtId: employee.districtId,
      plantId: employee.plantId,
      customerName,
      customerPhone,
      shopName,
      notes,
      lat,
      lng,
      totalAmount,
      items: { create: orderItems },
    },
    include: { items: { include: { variant: { include: { product: true } } } } },
  });

  res.status(201).json({ order });
});

const listQuerySchema = z.object({
  employeeId: z.string().optional(),
  districtId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  status: z.string().optional(),
});

ordersRouter.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { employeeId, districtId, from, to, status } = parsed.data;

  const where: Record<string, unknown> = {};
  if (req.user!.role === "sales_employee") {
    where.employeeId = req.user!.sub;
  } else {
    Object.assign(where, plantFilter(req));
    if (employeeId) where.employeeId = employeeId;
  }
  if (districtId) where.districtId = districtId;
  if (status) where.status = status;
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    };
  }

  const orders = await prisma.order.findMany({
    where,
    include: {
      employee: { select: { id: true, name: true } },
      district: true,
      plant: { select: { id: true, name: true, code: true } },
      items: { include: { variant: { include: { product: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  res.json({ orders });
});

ordersRouter.get("/:id", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: {
      employee: { select: { id: true, name: true } },
      district: true,
      plant: { select: { id: true, name: true, code: true } },
      items: { include: { variant: { include: { product: true } } } },
    },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (req.user!.role === "sales_employee" && order.employeeId !== req.user!.sub) {
    return res.status(403).json({ error: "Forbidden" });
  }
  // Another plant's order is "not found" to a plant admin, so its id says nothing.
  if (req.user!.role === "admin" && order.plantId !== req.user!.plantId) {
    return res.status(404).json({ error: "Order not found" });
  }
  res.json({ order });
});

const statusSchema = z.object({
  status: z.enum(["pending", "confirmed", "delivered", "cancelled"]),
});

type OrderStatus = z.infer<typeof statusSchema>["status"];

// pending → confirmed → delivered, and pending/confirmed → cancelled.
// delivered and cancelled are final.
export const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

ordersRouter.patch("/:id/status", requireAdmin, async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const next = parsed.data.status;

  const current = await prisma.order.findFirst({
    where: { id: req.params.id, ...(req.user!.role === "admin" ? { plantId: req.user!.plantId! } : {}) },
    select: { status: true },
  });
  if (!current) return res.status(404).json({ error: "Order not found" });
  if (!ALLOWED_TRANSITIONS[current.status].includes(next)) {
    return res.status(409).json({ error: `Cannot change order from ${current.status} to ${next}` });
  }

  // Conditional on the status we checked, so two admins can't both apply a
  // transition from the same starting state.
  const { count } = await prisma.order.updateMany({
    where: { id: req.params.id, status: current.status },
    data: { status: next },
  });
  if (count === 0) {
    return res.status(409).json({ error: "Order status changed meanwhile; reload and try again" });
  }
  const order = await prisma.order.findUniqueOrThrow({ where: { id: req.params.id } });
  res.json({ order });
});

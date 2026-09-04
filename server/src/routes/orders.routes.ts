import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

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

  const employee = await prisma.user.findUnique({ where: { id: employeeId } });
  if (!employee?.districtId) {
    return res.status(400).json({ error: "Employee has no district assigned" });
  }

  const variantIds = items.map((i) => i.variantId);
  const variants = await prisma.productVariant.findMany({ where: { id: { in: variantIds } } });
  if (variants.length !== new Set(variantIds).size) {
    return res.status(400).json({ error: "One or more product sizes not found" });
  }

  const priceById = new Map(variants.map((v) => [v.id, v.price]));
  const orderItems = items.map((i) => ({
    variantId: i.variantId,
    quantity: i.quantity,
    unitPrice: priceById.get(i.variantId)!,
  }));
  const totalAmount = orderItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const order = await prisma.order.create({
    data: {
      employeeId,
      districtId: employee.districtId,
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
  } else if (employeeId) {
    where.employeeId = employeeId;
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
      items: { include: { variant: { include: { product: true } } } },
    },
  });
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (req.user!.role === "sales_employee" && order.employeeId !== req.user!.sub) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json({ order });
});

const statusSchema = z.object({
  status: z.enum(["pending", "confirmed", "delivered", "cancelled"]),
});

ordersRouter.patch("/:id/status", requireRole("admin"), async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const order = await prisma.order.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status },
  });
  res.json({ order });
});

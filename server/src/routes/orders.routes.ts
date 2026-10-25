import { Router, type Request } from "express";
import multer from "multer";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { requireAdmin, requireAuth, requireRole } from "../middleware/auth";
import { plantPriceMap } from "../lib/prices";
import { plantFilter } from "../lib/scope";
import { distanceM } from "../lib/geo";

export const ordersRouter = Router();

ordersRouter.use(requireAuth);

// A voice note comes with the order as multipart (an "order" JSON field plus a
// "voiceNote" file). A few minutes of phone audio stays well under 8 MB.
const VOICE_NOTE_MAX_BYTES = 8 * 1024 * 1024;
const voiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: VOICE_NOTE_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith("audio/")),
});

const orderInclude = {
  employee: { select: { id: true, name: true } },
  district: true,
  plant: { select: { id: true, name: true, code: true } },
  items: { include: { variant: { include: { product: true } }, product: true } },
  voiceNote: { select: { durationMs: true } },
  store: { select: { id: true, name: true, lat: true, lng: true } },
} as const;

const catalogItem = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().positive(),
});

// A size or pack the catalogue doesn't have, priced by the salesperson on the
// spot: of a catalogue product (productId) or one they name (customName).
const customItem = z
  .object({
    productId: z.string().min(1).optional(),
    customName: z.string().trim().max(200).optional(),
    customSize: z.string({ required_error: "Describe the custom size or pack" }).trim().min(1, "Describe the custom size or pack").max(100),
    quantity: z.number().int().positive(),
    unitPrice: z
      .number({ required_error: "Enter the price for the custom item" })
      .positive("Enter the price for the custom item")
      .max(10_000_000),
  })
  .refine((i) => i.productId || i.customName, "Name the product for the custom item");

const createSchema = z.object({
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  shopName: z.string().optional(),
  notes: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  // Orders are only taken at the shop. Phone orders were dropped, and older
  // app builds that still send "phone" are refused.
  channel: z.literal("in_person", { errorMap: () => ({ message: "Orders can only be taken at the shop" }) }).default("in_person"),
  storeId: z.string().min(1).optional(),
  voiceNoteDurationMs: z.number().int().nonnegative().optional(),
  // A line with a variantId is a catalogue size, any other a custom line.
  items: z
    .array(z.record(z.unknown()))
    .min(1)
    .transform((lines, ctx) =>
      lines.map((line) => {
        const r = "variantId" in line ? catalogItem.safeParse(line) : customItem.safeParse(line);
        if (!r.success) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, message: r.error.issues[0]?.message ?? "Invalid order line" });
          return z.NEVER;
        }
        return r.data;
      })
    ),
});

// JSON body, or multipart with the order JSON in an "order" field.
function orderBody(req: Request): unknown {
  if (typeof req.body?.order !== "string") return req.body;
  try {
    return JSON.parse(req.body.order);
  } catch {
    return null;
  }
}

ordersRouter.post("/", requireRole("sales_employee"), voiceUpload.single("voiceNote"), async (req, res) => {
  const parsed = createSchema.safeParse(orderBody(req));
  if (!parsed.success) {
    const custom = parsed.error.issues.find((i) => i.code === "custom" || i.path[0] === "channel");
    return res.status(400).json({ error: custom?.message ?? parsed.error.flatten() });
  }
  const { customerName, customerPhone, shopName, notes, lat, lng, items, voiceNoteDurationMs, channel, storeId } =
    parsed.data;
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

  // A shop of the salesperson's plant: approved, or one they added themselves.
  const store = storeId
    ? await prisma.store.findFirst({
        where: { id: storeId, plantId: employee.plantId, OR: [{ status: "approved" }, { createdById: employeeId }] },
        select: { id: true, name: true, lat: true, lng: true },
      })
    : null;
  if (storeId && !store) return res.status(400).json({ error: "That shop is not on your plant's map" });
  // Taken in person means the phone was at the shop. The distance is kept so
  // the office can see an "in person" order that was really taken elsewhere.
  const distanceFromStoreM =
    store && channel === "in_person" && lat !== undefined && lng !== undefined
      ? Math.round(distanceM(store, { lat, lng }))
      : null;

  const catalogLines = items.filter((i): i is z.infer<typeof catalogItem> => "variantId" in i);
  const customLines = items.filter((i): i is z.infer<typeof customItem> => !("variantId" in i));

  const customProductIds = [...new Set(customLines.flatMap((i) => (i.productId ? [i.productId] : [])))];
  if (customProductIds.length > 0) {
    const found = await prisma.product.count({ where: { id: { in: customProductIds }, active: true } });
    if (found !== customProductIds.length) {
      return res.status(400).json({ error: "A custom item's product is not found or no longer available" });
    }
  }

  const variantIds = catalogLines.map((i) => i.variantId);
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

  const orderItems: Prisma.OrderItemCreateWithoutOrderInput[] = [
    ...catalogLines.map((i) => ({
      variant: { connect: { id: i.variantId } },
      quantity: i.quantity,
      unitPrice: priceById.get(i.variantId)!,
    })),
    ...customLines.map((i) => ({
      ...(i.productId ? { product: { connect: { id: i.productId } } } : { customName: i.customName }),
      customSize: i.customSize,
      quantity: i.quantity,
      unitPrice: new Prisma.Decimal(i.unitPrice.toFixed(2)),
    })),
  ];
  // Decimal arithmetic, so paise never drift the way floating point does.
  const totalAmount = orderItems.reduce(
    (sum, i) => sum.add(new Prisma.Decimal(i.unitPrice as Prisma.Decimal).mul(i.quantity)),
    new Prisma.Decimal(0)
  );

  const voice = req.file;
  const order = await prisma.order.create({
    data: {
      employeeId,
      districtId: employee.districtId,
      plantId: employee.plantId,
      customerName,
      customerPhone,
      shopName: shopName ?? store?.name,
      notes,
      lat,
      lng,
      channel,
      storeId: store?.id,
      distanceFromStoreM,
      totalAmount,
      items: { create: orderItems },
      ...(voice
        ? { voiceNote: { create: { mimeType: voice.mimetype, durationMs: voiceNoteDurationMs, data: voice.buffer } } }
        : {}),
    },
    include: orderInclude,
  });

  res.status(201).json({ order });
});

// The order's voice note as audio, for the office (or the salesperson who
// recorded it) to play back.
ordersRouter.get("/:id/voice-note", async (req, res) => {
  const order = await findVisibleOrder(req, req.params.id);
  if (!order) return res.status(404).json({ error: "Order not found" });
  const note = await prisma.orderVoiceNote.findUnique({ where: { orderId: order.id } });
  if (!note) return res.status(404).json({ error: "This order has no voice note" });
  res.setHeader("Content-Type", note.mimeType);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.send(Buffer.from(note.data));
});

// The order if this user may see it: their own as a salesperson, their
// plant's as a plant admin. Anything else is "not found", so an id says nothing.
async function findVisibleOrder(req: Request, id: string) {
  const role = req.user!.role;
  return prisma.order.findFirst({
    where: {
      id,
      ...(role === "sales_employee" ? { employeeId: req.user!.sub } : {}),
      ...(role === "admin" ? { plantId: req.user!.plantId ?? "" } : {}),
    },
    select: { id: true },
  });
}

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
    include: orderInclude,
    orderBy: { createdAt: "desc" },
  });

  res.json({ orders });
});

ordersRouter.get("/:id", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: orderInclude,
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

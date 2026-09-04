import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth, requireRole } from "../middleware/auth";

export const productsRouter = Router();

productsRouter.use(requireAuth);

productsRouter.get("/", async (req, res) => {
  const includeInactiveVariants = req.user!.role === "admin";
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    include: {
      variants: {
        where: includeInactiveVariants ? {} : { active: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });
  res.json({ products });
});

productsRouter.get("/lookup/:code", async (req, res) => {
  const code = req.params.code.trim().toUpperCase();
  const product = await prisma.product.findFirst({
    where: { shortCode: { equals: code, mode: "insensitive" }, active: true },
    include: { variants: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!product) return res.status(404).json({ error: "No product with that code" });
  res.json({ product });
});

const createSchema = z.object({
  name: z.string().min(1),
  shortCode: z.string().min(1),
  category: z.string().min(1),
});

productsRouter.post("/", requireRole("admin"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const product = await prisma.product.create({
    data: { ...parsed.data, shortCode: parsed.data.shortCode.trim().toUpperCase() },
  });
  res.status(201).json({ product });
});

const updateSchema = createSchema.partial().extend({ active: z.boolean().optional() });

productsRouter.patch("/:id", requireRole("admin"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { shortCode, ...rest } = parsed.data;
  const product = await prisma.product.update({
    where: { id: req.params.id },
    data: { ...rest, ...(shortCode ? { shortCode: shortCode.trim().toUpperCase() } : {}) },
  });
  res.json({ product });
});

const createVariantSchema = z.object({
  sizeLabel: z.string().min(1),
  unit: z.string().min(1),
  price: z.number().min(0).optional(),
  sortOrder: z.number().int().optional(),
});

productsRouter.post("/:id/variants", requireRole("admin"), async (req, res) => {
  const parsed = createVariantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const variant = await prisma.productVariant.create({
    data: { productId: req.params.id, ...parsed.data },
  });
  res.status(201).json({ variant });
});

const updateVariantSchema = z.object({
  sizeLabel: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  price: z.number().min(0).optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

productsRouter.patch("/variants/:variantId", requireRole("admin"), async (req, res) => {
  const parsed = updateVariantSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const variant = await prisma.productVariant.update({
    where: { id: req.params.variantId },
    data: parsed.data,
  });
  res.json({ variant });
});

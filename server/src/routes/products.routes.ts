import { Router, type Request } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAdmin, requireAuth, requireSuperAdmin } from "../middleware/auth";
import { plantPriceMap, withPlantPrice } from "../lib/prices";
import { scopedPlantId, targetPlantId } from "../lib/scope";

export const productsRouter = Router();

productsRouter.use(requireAuth);

// Whose prices a catalogue request sees: a salesperson their own plant's, a
// plant admin theirs, the super admin the ?plantId they picked or the company
// prices.
function pricePlantId(req: Request): string | null {
  return req.user!.role === "sales_employee" ? req.user!.plantId : scopedPlantId(req);
}

productsRouter.get("/", async (req, res) => {
  const includeInactiveVariants = req.user!.role !== "sales_employee";
  const [products, prices] = await Promise.all([
    prisma.product.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: {
        variants: {
          where: includeInactiveVariants ? {} : { active: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    plantPriceMap(pricePlantId(req)),
  ]);
  res.json({
    products: products.map((p) => ({ ...p, variants: p.variants.map((v) => withPlantPrice(v, prices)) })),
  });
});

productsRouter.get("/lookup/:code", async (req, res) => {
  const code = req.params.code.trim().toUpperCase();
  const product = await prisma.product.findFirst({
    where: { shortCode: { equals: code, mode: "insensitive" }, active: true },
    include: { variants: { where: { active: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!product) return res.status(404).json({ error: "No product with that code" });
  const prices = await plantPriceMap(pricePlantId(req));
  res.json({ product: { ...product, variants: product.variants.map((v) => withPlantPrice(v, prices)) } });
});

const createSchema = z.object({
  name: z.string().min(1),
  shortCode: z.string().min(1),
  category: z.string().min(1),
});

// The product list and company prices are shared by every plant, so only the
// super admin changes them. Plant admins set their own prices below.
productsRouter.post("/", requireSuperAdmin, async (req, res) => {
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

productsRouter.patch("/:id", requireSuperAdmin, async (req, res) => {
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

productsRouter.post("/:id/variants", requireSuperAdmin, async (req, res) => {
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

productsRouter.patch("/variants/:variantId", requireSuperAdmin, async (req, res) => {
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

const plantPriceSchema = z.object({
  plantId: z.string().optional(),
  // null goes back to the company price.
  price: z.number().positive().nullable(),
});

// A plant's own price for one size. Plant admins set their plant's; the super
// admin passes the plant.
productsRouter.put("/variants/:variantId/plant-price", requireAdmin, async (req, res) => {
  const parsed = plantPriceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Price must be a positive number, or null for the company price" });
  }
  const plantId = targetPlantId(req, parsed.data.plantId);
  const variant = await prisma.productVariant.findUnique({ where: { id: req.params.variantId } });
  if (!variant) return res.status(404).json({ error: "Product size not found" });

  const { price } = parsed.data;
  if (price === null) {
    await prisma.plantPrice.deleteMany({ where: { plantId, variantId: variant.id } });
  } else {
    await prisma.plantPrice.upsert({
      where: { plantId_variantId: { plantId, variantId: variant.id } },
      update: { price },
      create: { plantId, variantId: variant.id, price },
    });
  }
  res.json({ variant: withPlantPrice(variant, await plantPriceMap(plantId)) });
});

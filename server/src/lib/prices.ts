import type { Prisma, ProductVariant } from "@prisma/client";
import { prisma } from "../db";

// Each plant can price a size differently. A size the plant hasn't priced
// sells at the company price on the variant.
export async function plantPriceMap(plantId: string | null): Promise<Map<string, Prisma.Decimal>> {
  if (!plantId) return new Map();
  const rows = await prisma.plantPrice.findMany({ where: { plantId } });
  return new Map(rows.map((r) => [r.variantId, r.price]));
}

// `price` is what the plant sells at; `basePrice` is the company price and
// `plantPrice` the plant's own (null when it uses the company price).
export function withPlantPrice<V extends ProductVariant>(variant: V, prices: Map<string, Prisma.Decimal>) {
  const plantPrice = prices.get(variant.id) ?? null;
  return { ...variant, basePrice: variant.price, plantPrice, price: plantPrice ?? variant.price };
}

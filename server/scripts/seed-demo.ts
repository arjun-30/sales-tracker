// Fills the database with believable demo data for a client presentation:
// sample prices on every pack size, three sample plants (each with an admin,
// salespeople, stores on the map and some prices of its own), and two weeks
// of duty hours, shop visits and orders.
//
//   npm run demo:seed
//
// It WIPES all orders, visits, duty sessions, location history, stores and
// plant prices first, so
// never run it against real data. Prices it sets are placeholders, not
// Roalux's real price list. Re-running gives the same data (seeded random).
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/db";

const DAYS_OF_HISTORY = 14;
const DEMO_PASSWORD = "demo@1234";

// ---- deterministic randomness -------------------------------------------------
let seed = 20261014;
function rand(): number {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const between = (min: number, max: number) => min + rand() * (max - min);
const int = (min: number, max: number) => Math.floor(between(min, max + 1));
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const chance = (p: number) => rand() < p;

// ---- sample prices --------------------------------------------------------------
const BRAND_TIER: [RegExp, number][] = [
  [/^ROALUX/, 1],
  [/^HITECH/, 0.9],
  [/^AMAZE/, 0.85],
  [/^RIU/, 0.8],
  [/^(ASTRA|BESTCOAT|DAYLIGHT|SUPERSTAR|LWP)/, 0.7],
];

// Price of a 1-litre (or 1 kg) pack before brand tier.
function perUnitBase(category: string, name: string): number {
  const premiumFinish = /EXTERIOR|WEATHER|GLOSS|SHINE/.test(name);
  switch (category) {
    case "Emulsion":
      return premiumFinish ? 430 : 340;
    case "Primer":
      return 190;
    case "Damp Proof":
      return 300;
    case "Waterproofing":
      return 380;
    case "Stainer":
      return 450;
    case "Distemper":
      return 120;
    default:
      return 200;
  }
}

const PUTTY_PRICES: Record<string, number> = { "1KG": 45, "5KG": 190, "20KG": 620, "40KG": 1100 };
const KG_DISTEMPER_PRICES: Record<string, number> = { "1KG": 60, "5KG": 260, "20KG": 900, "40KG": 1650 };

function samplePrice(category: string, name: string, sizeLabel: string): number {
  const tier = BRAND_TIER.find(([re]) => re.test(name))?.[1] ?? 0.85;
  let price: number;
  if (sizeLabel === "STD") {
    price = category === "Roller" ? 240 : 320;
  } else if (category === "Wall Putty") {
    price = (PUTTY_PRICES[sizeLabel] ?? 300) * (/TEXTURE|ACRYLIC|WATERPROOF/.test(name) ? 1.6 : 1);
  } else if (sizeLabel.endsWith("KG")) {
    price = KG_DISTEMPER_PRICES[sizeLabel] ?? 300;
  } else {
    const litres = Number.parseFloat(sizeLabel) || 1;
    const packDiscount = litres >= 20 ? 0.82 : litres >= 10 ? 0.88 : litres >= 4 ? 0.94 : 1;
    price = perUnitBase(category, name) * litres * packDiscount;
  }
  return Math.max(5, Math.round((price * tier) / 5) * 5);
}

// ---- plants, people, shops ---------------------------------------------------------
// Sample plants only: the real six and their codes come from the client.
// `priceFactor` gives each plant prices of its own (1 = company price).
const PLANTS = [
  { code: "CHN", name: "Chennai Plant", address: "Ambattur Industrial Estate, Chennai", priceFactor: 1,
    admin: { phone: "9888888801", name: "Chennai Plant Admin" } },
  { code: "MDU", name: "Madurai Plant", address: "Kappalur SIDCO, Madurai", priceFactor: 0.96,
    admin: { phone: "9888888802", name: "Madurai Plant Admin" } },
  { code: "CBE", name: "Coimbatore Plant", address: "Kurichi SIDCO, Coimbatore", priceFactor: 1.03,
    admin: { phone: "9888888803", name: "Coimbatore Plant Admin" } },
];

const STAFF = [
  { plant: "CHN", phone: "9000000001", name: "Karthik Raja", district: "Chennai" },
  { plant: "CHN", phone: "9999999998", name: "Vijay", district: "Cuddalore" },
  { plant: "MDU", phone: "9000000003", name: "Senthil Kumar", district: "Madurai" },
  { plant: "MDU", phone: "9000000005", name: "Arun Prakash", district: "Tiruchirappalli" },
  { plant: "CBE", phone: "9000000004", name: "Priya Dharshini", district: "Coimbatore" },
  { plant: "CBE", phone: "9000000006", name: "Manikandan S", district: "Salem" },
];

const SHOP_PREFIX = ["Sri", "New", "Om", "Jai", "Royal", "Sree", "Lakshmi", "Balaji", "Ganesh", "Murugan"];
const SHOP_NAME = ["Paints", "Hardwares", "Paint House", "Traders", "Colour World", "Agencies", "Building Materials", "Enterprises"];
const OWNERS = [
  "Ramesh", "Suresh", "Kannan", "Muthu", "Selvam", "Ravi", "Prakash", "Bala", "Ganesan", "Mohan",
  "Saravanan", "Rajesh", "Anand", "Vel", "Shankar", "Kumar", "Siva", "Durai", "Palani", "Ilango",
];
const NOTES = ["Asked for shade card", "Wants credit for 30 days", "Will reorder next week", "Compared with Asian Paints price", "", "", ""];

function istDate(daysAgo: number): string {
  const d = new Date(Date.now() + 5.5 * 3600_000 - daysAgo * 86_400_000);
  return d.toISOString().slice(0, 10);
}
const at = (day: string, minutesFromMidnight: number) =>
  new Date(new Date(`${day}T00:00:00+05:30`).getTime() + minutesFromMidnight * 60_000);
const isSunday = (day: string) => new Date(`${day}T12:00:00+05:30`).getUTCDay() === 0;

// ---- main -----------------------------------------------------------------------
async function main() {
  console.log("Wiping orders, visits, duty sessions and location history…");
  await prisma.$transaction([
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.visit.deleteMany(),
    prisma.dutySession.deleteMany(),
    prisma.locationHistory.deleteMany(),
    prisma.employeeLocation.deleteMany(),
    prisma.store.deleteMany(),
    prisma.plantPrice.deleteMany(),
  ]);

  console.log("Setting sample prices…");
  const products = await prisma.product.findMany({ include: { variants: true } });
  for (const p of products) {
    for (const v of p.variants) {
      await prisma.productVariant.update({
        where: { id: v.id },
        data: { price: samplePrice(p.category, p.name, v.sizeLabel) },
      });
    }
  }
  const variants = await prisma.productVariant.findMany({
    where: { active: true, product: { active: true } },
    include: { product: true },
  });

  console.log("Creating plants and their admins…");
  const demoHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  // Free the demo staff's codes first so they can be renumbered without clashes.
  await prisma.user.updateMany({ where: { phone: { in: STAFF.map((s) => s.phone) } }, data: { employeeCode: null } });
  const plants = new Map<string, { id: string; code: string; prices: Map<string, Prisma.Decimal> }>();
  for (const p of PLANTS) {
    const plant = await prisma.plant.upsert({
      where: { code: p.code },
      update: { name: p.name, address: p.address },
      create: { code: p.code, name: p.name, address: p.address },
    });
    await prisma.user.upsert({
      where: { phone: p.admin.phone },
      update: { name: p.admin.name, role: "admin", plantId: plant.id, active: true },
      create: { phone: p.admin.phone, name: p.admin.name, role: "admin", plantId: plant.id, passwordHash: demoHash },
    });
    const prices = new Map<string, Prisma.Decimal>();
    if (p.priceFactor !== 1) {
      for (const v of variants) {
        const price = new Prisma.Decimal(Math.max(5, Math.round((v.price.toNumber() * p.priceFactor) / 5) * 5));
        await prisma.plantPrice.create({ data: { plantId: plant.id, variantId: v.id, price } });
        prices.set(v.id, price);
      }
    }
    plants.set(p.code, { id: plant.id, code: p.code, prices });
  }

  console.log("Creating salespeople…");
  const districts = new Map((await prisma.district.findMany()).map((d) => [d.name, d]));
  const staff = [];
  const counters = new Map<string, number>();
  for (const s of STAFF) {
    const district = districts.get(s.district)!;
    const plant = plants.get(s.plant)!;
    const n = (counters.get(plant.code) ?? 0) + 1;
    counters.set(plant.code, n);
    const employeeCode = `RLX-${plant.code}-${String(n).padStart(3, "0")}`;
    const existing = await prisma.user.findUnique({ where: { phone: s.phone } });
    const user = existing
      ? await prisma.user.update({
          where: { id: existing.id },
          data: { name: s.name, employeeCode, districtId: district.id, plantId: plant.id, active: true },
        })
      : await prisma.user.create({
          data: {
            name: s.name,
            phone: s.phone,
            employeeCode,
            role: "sales_employee",
            districtId: district.id,
            plantId: plant.id,
            passwordHash: demoHash,
          },
        });
    staff.push({ user, district, plant });
  }

  // The placeholder plant from the migration goes once nothing is left in it.
  const main = await prisma.plant.findUnique({ where: { code: "MAIN" } });
  if (main) {
    const [users, stores] = await Promise.all([
      prisma.user.count({ where: { plantId: main.id } }),
      prisma.store.count({ where: { plantId: main.id } }),
    ]);
    if (users + stores === 0) await prisma.plant.delete({ where: { id: main.id } });
  }

  console.log(`Generating ${DAYS_OF_HISTORY} days of activity…`);
  let orderCount = 0;
  let visitCount = 0;
  let storeCount = 0;
  for (const { user, district, plant } of staff) {
    const priceOf = (v: (typeof variants)[number]) => plant.prices.get(v.id) ?? v.price;
    const shops = Array.from({ length: 14 }, () => ({
      name: `${pick(SHOP_PREFIX)} ${pick(SHOP_NAME)}`,
      owner: pick(OWNERS),
      phone: `9${int(100000000, 999999999)}`,
      lat: district.centerLat + between(-0.06, 0.06),
      lng: district.centerLng + between(-0.06, 0.06),
    }));
    // Most shops they visit are stores the plant already has on its map.
    for (const shop of shops.slice(0, 9)) {
      await prisma.store.create({
        data: {
          plantId: plant.id,
          name: shop.name,
          ownerName: shop.owner,
          phone: shop.phone,
          address: `${district.name} district`,
          lat: shop.lat,
          lng: shop.lng,
        },
      });
      storeCount++;
    }
    let last: { lat: number; lng: number; at: Date } | null = null;

    for (let daysAgo = DAYS_OF_HISTORY; daysAgo >= 1; daysAgo--) {
      const day = istDate(daysAgo);
      if (isSunday(day) || chance(0.1)) continue;

      const start = at(day, int(9 * 60, 9 * 60 + 45));
      const end = at(day, int(17 * 60 + 45, 19 * 60));
      await prisma.dutySession.create({
        data: { userId: user.id, startedAt: start, endedAt: end, endReason: "manual" },
      });

      let cursor = new Date(start.getTime() + int(20, 50) * 60_000);
      const visitsToday = int(3, 6);
      for (let i = 0; i < visitsToday; i++) {
        const length = int(15, 45) * 60_000;
        if (cursor.getTime() + length > end.getTime() - 15 * 60_000) break;
        const shop = pick(shops);
        const checkOut = new Date(cursor.getTime() + length);
        await prisma.visit.create({
          data: {
            employeeId: user.id,
            districtId: district.id,
            plantId: plant.id,
            shopName: shop.name,
            checkInAt: cursor,
            checkInLat: shop.lat,
            checkInLng: shop.lng,
            checkOutAt: checkOut,
            checkOutLat: shop.lat,
            checkOutLng: shop.lng,
            notes: pick(NOTES) || null,
          },
        });
        visitCount++;

        if (chance(0.55)) {
          const lines = Array.from({ length: int(1, 4) }, () => {
            const v = pick(variants);
            const big = /20L|40KG|20KG/.test(v.sizeLabel);
            return { variant: v, quantity: big ? int(1, 4) : int(2, 12) };
          });
          const unique = [...new Map(lines.map((l) => [l.variant.id, l])).values()];
          const total = unique.reduce((sum, l) => sum.add(priceOf(l.variant).mul(l.quantity)), new Prisma.Decimal(0));
          const status =
            daysAgo >= 4
              ? chance(0.08) ? "cancelled" : chance(0.9) ? "delivered" : "confirmed"
              : daysAgo >= 2
                ? chance(0.1) ? "cancelled" : chance(0.25) ? "pending" : chance(0.6) ? "confirmed" : "delivered"
                : chance(0.6) ? "pending" : "confirmed";
          await prisma.order.create({
            data: {
              employeeId: user.id,
              districtId: district.id,
              plantId: plant.id,
              customerName: shop.owner,
              customerPhone: shop.phone,
              shopName: shop.name,
              totalAmount: total,
              status,
              lat: shop.lat,
              lng: shop.lng,
              createdAt: new Date(checkOut.getTime() - 5 * 60_000),
              items: {
                create: unique.map((l) => ({ variantId: l.variant.id, quantity: l.quantity, unitPrice: priceOf(l.variant) })),
              },
            },
          });
          orderCount++;
        }
        last = { lat: shop.lat, lng: shop.lng, at: checkOut };
        cursor = new Date(checkOut.getTime() + int(20, 60) * 60_000);
      }
    }

    // Everyone starts the demo off duty, last seen where their last visit was.
    if (last) {
      await prisma.employeeLocation.create({
        data: { userId: user.id, lat: last.lat, lng: last.lng, onDuty: false },
      });
      await prisma.$executeRaw`UPDATE "EmployeeLocation" SET "updatedAt" = ${last.at} WHERE "userId" = ${user.id}`;
    }
  }

  const priced = await prisma.productVariant.count({ where: { price: { gt: 0 } } });
  console.log(
    `Done: ${plants.size} plants, ${staff.length} salespeople, ${storeCount} stores, ${visitCount} visits, ${orderCount} orders, ${priced} priced sizes.`
  );
  console.log(
    `Plant admins ${PLANTS.map((p) => p.admin.phone).join(", ")} and new salespeople use password "${DEMO_PASSWORD}"; existing logins keep theirs.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

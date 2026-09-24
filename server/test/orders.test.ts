import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { api, bearer, login, resetDb, seedFixtures, type Fixtures } from "./helpers";

let f: Fixtures;
let emp: string;
let admin: string;
beforeEach(async () => {
  await resetDb();
  f = await seedFixtures();
  emp = (await login("9000000001")).accessToken;
  admin = (await login("9999999999")).accessToken;
});
afterAll(() => prisma.$disconnect());

const placeOrder = (items: unknown, extra: Record<string, unknown> = {}) =>
  api().post("/api/orders").set(bearer(emp)).send({ customerName: "Lakshmi Hardware", items, ...extra });

const setStatus = (id: string, status: string) =>
  api().patch(`/api/orders/${id}/status`).set(bearer(admin)).send({ status });

async function newOrderId() {
  const res = await placeOrder([{ variantId: f.v1L.id, quantity: 1 }]);
  return res.body.order.id as string;
}

describe("product lookup", () => {
  it("TC-16 lower-case code finds the product with active sizes only", async () => {
    const res = await api().get("/api/products/lookup/rpe").set(bearer(emp));
    expect(res.status).toBe(200);
    expect(res.body.product.shortCode).toBe("RPE");
    expect(res.body.product.variants.map((v: { sizeLabel: string }) => v.sizeLabel)).toEqual(["1L", "4L"]);
  });

  it("FR-ORD-01 an inactive product is not found", async () => {
    expect((await api().get("/api/products/lookup/OEN").set(bearer(emp))).status).toBe(404);
  });
});

describe("placing orders", () => {
  it("TC-17 prices come from the catalogue; a tampered unitPrice is ignored", async () => {
    const res = await placeOrder(
      [
        { variantId: f.v1L.id, quantity: 2, unitPrice: 1 },
        { variantId: f.v4L.id, quantity: 1, unitPrice: 1 },
      ],
      { totalAmount: 1 }
    );
    expect(res.status).toBe(201);
    expect(res.body.order.totalAmount).toBe(2 * 500 + 1800);
    expect(res.body.order.status).toBe("pending");
    expect(res.body.order.districtId).toBe(f.chennai.id);
    const prices = res.body.order.items.map((i: { unitPrice: number }) => i.unitPrice);
    expect(prices.sort((a: number, b: number) => a - b)).toEqual([500, 1800]);
  });

  it("TC-17 a later price change does not rewrite a past order", async () => {
    const id = await newOrderId();
    await prisma.productVariant.update({ where: { id: f.v1L.id }, data: { price: 999 } });
    const order = await prisma.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
    expect(order.totalAmount).toBe(500);
    expect(order.items[0].unitPrice).toBe(500);
  });

  it("TC-18 an inactive size is rejected with 400", async () => {
    const res = await placeOrder([{ variantId: f.v20LInactive.id, quantity: 1 }]);
    expect(res.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);
  });

  it("TC-18 an active size of an inactive product is rejected with 400", async () => {
    const res = await placeOrder([{ variantId: f.inactiveProductVariant.id, quantity: 1 }]);
    expect(res.status).toBe(400);
  });

  it("TC-18 one bad line rejects the whole order", async () => {
    const res = await placeOrder([
      { variantId: f.v1L.id, quantity: 1 },
      { variantId: f.v20LInactive.id, quantity: 1 },
    ]);
    expect(res.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);
  });

  it("TC-19 no items, zero quantity or a missing customer name return 400", async () => {
    expect((await placeOrder([])).status).toBe(400);
    expect((await placeOrder([{ variantId: f.v1L.id, quantity: 0 }])).status).toBe(400);
    const noName = await api()
      .post("/api/orders")
      .set(bearer(emp))
      .send({ items: [{ variantId: f.v1L.id, quantity: 1 }] });
    expect(noName.status).toBe(400);
  });
});

describe("order status", () => {
  it("TC-20 admin moves an order pending, confirmed, delivered and lists reflect it", async () => {
    const id = await newOrderId();

    const confirmed = await setStatus(id, "confirmed");
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.order.status).toBe("confirmed");
    expect((await setStatus(id, "delivered")).status).toBe(200);

    const list = await api().get("/api/orders?status=delivered").set(bearer(admin));
    expect(list.body.orders.map((o: { id: string }) => o.id)).toEqual([id]);
    const own = await api().get("/api/orders").set(bearer(emp));
    expect(own.body.orders[0].status).toBe("delivered");

    const summary = await api().get("/api/reports/summary").set(bearer(admin));
    expect(summary.body.orderStatusBreakdown).toEqual([{ status: "delivered", count: 1 }]);
  });

  it.each([
    ["pending", "cancelled"],
    ["confirmed", "cancelled"],
  ])("allows %s to %s", async (from, to) => {
    const id = await newOrderId();
    if (from === "confirmed") await setStatus(id, "confirmed");
    expect((await setStatus(id, to)).status).toBe(200);
  });

  it.each([
    ["pending", "delivered"],
    ["pending", "pending"],
    ["delivered", "cancelled"],
    ["delivered", "pending"],
    ["cancelled", "confirmed"],
  ])("rejects %s to %s with 409", async (from, to) => {
    const id = await newOrderId();
    if (from === "delivered") {
      await setStatus(id, "confirmed");
      await setStatus(id, "delivered");
    } else if (from === "cancelled") {
      await setStatus(id, "cancelled");
    }
    const res = await setStatus(id, to);
    expect(res.status).toBe(409);
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order.status).toBe(from);
  });

  it("returns 404 for an unknown order and 400 for an unknown status", async () => {
    expect((await setStatus("does-not-exist", "confirmed")).status).toBe(404);
    const id = await newOrderId();
    expect((await setStatus(id, "shipped")).status).toBe(400);
  });
});

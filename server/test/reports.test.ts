import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { api, bearer, login, resetDb, seedFixtures, type Fixtures } from "./helpers";

let f: Fixtures;
let admin: string;
beforeEach(async () => {
  await resetDb();
  f = await seedFixtures();
  admin = (await login("9999999999")).accessToken;
});
afterAll(() => prisma.$disconnect());

async function orderAt(createdAt: string, employeeId: string, districtId: string, amount: number) {
  return prisma.order.create({
    data: {
      employeeId,
      districtId,
      customerName: "Fixture",
      totalAmount: amount,
      createdAt: new Date(createdAt),
      items: { create: [{ variantId: f.v1L.id, quantity: amount / 500, unitPrice: 500 }] },
    },
  });
}

describe("reports", () => {
  it("TC-23 dashboard totals for one district and week match a direct count", async () => {
    await orderAt("2026-09-14T06:00:00Z", f.empA.id, f.chennai.id, 1000); // in range
    await orderAt("2026-09-18T06:00:00Z", f.empA.id, f.chennai.id, 1500); // in range
    await orderAt("2026-09-16T06:00:00Z", f.empB.id, f.madurai.id, 5000); // other district
    await orderAt("2026-09-25T06:00:00Z", f.empA.id, f.chennai.id, 2000); // after range

    const from = "2026-09-14T00:00:00Z";
    const to = "2026-09-20T23:59:59Z";
    const res = await api()
      .get(`/api/reports/summary?districtId=${f.chennai.id}&from=${from}&to=${to}`)
      .set(bearer(admin));
    expect(res.status).toBe(200);

    const direct = await prisma.order.aggregate({
      where: { districtId: f.chennai.id, createdAt: { gte: new Date(from), lte: new Date(to) } },
      _count: true,
      _sum: { totalAmount: true },
    });
    expect(res.body.totalOrders).toBe(direct._count);
    expect(res.body.totalSales).toBe(direct._sum.totalAmount);
    expect(res.body.totalOrders).toBe(2);
    expect(res.body.totalSales).toBe(2500);
  });

  it("TC-24 an order at 01:00 IST counts on that IST date, not the previous UTC day", async () => {
    await orderAt("2026-09-22T19:30:00Z", f.empA.id, f.chennai.id, 500); // 23 Sep 01:00 IST
    await orderAt("2026-09-23T10:00:00Z", f.empA.id, f.chennai.id, 1000); // 23 Sep 15:30 IST
    await orderAt("2026-09-23T18:29:00Z", f.empA.id, f.chennai.id, 1500); // 23 Sep 23:59 IST
    await orderAt("2026-09-23T18:31:00Z", f.empA.id, f.chennai.id, 2000); // 24 Sep 00:01 IST

    const res = await api().get("/api/reports/summary").set(bearer(admin));
    expect(res.body.ordersOverTime).toEqual([
      { day: "2026-09-23", total: 3000, count: 3 },
      { day: "2026-09-24", total: 2000, count: 1 },
    ]);
  });

  it("FR-RPT-06 district coverage lists every district even with a district filter", async () => {
    const res = await api().get(`/api/reports/summary?districtId=${f.chennai.id}`).set(bearer(admin));
    expect(res.body.districtActivity).toHaveLength(2);
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { api, bearer, login, resetDb, seedFixtures, type Fixtures } from "./helpers";

let f: Fixtures;
let empA: string;
let empB: string;
beforeEach(async () => {
  await resetDb();
  f = await seedFixtures();
  empA = (await login("9000000001")).accessToken;
  empB = (await login("9000000002")).accessToken;
});
afterAll(() => prisma.$disconnect());

describe("role and ownership checks", () => {
  it("TC-05 an employee token gets 403 on admin-only routes", async () => {
    expect((await api().get("/api/employees").set(bearer(empA))).status).toBe(403);
    expect((await api().get("/api/reports/summary").set(bearer(empA))).status).toBe(403);
    expect((await api().get("/api/tracking/live").set(bearer(empA))).status).toBe(403);
    const status = await api()
      .patch("/api/orders/anything/status")
      .set(bearer(empA))
      .send({ status: "confirmed" });
    expect(status.status).toBe(403);
  });

  it("TC-06 employee A cannot read employee B's order", async () => {
    const created = await api()
      .post("/api/orders")
      .set(bearer(empB))
      .send({ customerName: "Shop B", items: [{ variantId: f.v1L.id, quantity: 1 }] });
    expect(created.status).toBe(201);

    const res = await api().get(`/api/orders/${created.body.order.id}`).set(bearer(empA));
    expect(res.status).toBe(403);
  });

  it("NFR-SEC-03 an employee's order list holds only their own orders, even with ?employeeId", async () => {
    await api()
      .post("/api/orders")
      .set(bearer(empB))
      .send({ customerName: "Shop B", items: [{ variantId: f.v1L.id, quantity: 1 }] });
    const res = await api().get(`/api/orders?employeeId=${f.empB.id}`).set(bearer(empA));
    expect(res.status).toBe(200);
    expect(res.body.orders).toEqual([]);
  });
});

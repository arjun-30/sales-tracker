import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { api, bearer, ensureSocket, login, putOnDuty, resetDb, seedFixtures, type Fixtures } from "./helpers";

let f: Fixtures;
let superAdmin: string;
let adminA: string;
let adminB: string;
let empA: string;
let empB: string;

beforeEach(async () => {
  ensureSocket();
  await resetDb();
  f = await seedFixtures();
  await putOnDuty(f.empA.id, f.empB.id);
  [superAdmin, adminA, adminB, empA, empB] = (
    await Promise.all(["9999999999", "9888888881", "9888888882", "9000000001", "9000000002"].map((p) => login(p)))
  ).map((l) => l.accessToken);
});
afterAll(() => prisma.$disconnect());

async function placeOrder(token: string, variantId = f.v1L.id) {
  const res = await api()
    .post("/api/orders")
    .set(bearer(token))
    .send({ customerName: "Shop", items: [{ variantId, quantity: 2 }] });
  expect(res.status).toBe(201);
  return res.body.order as { id: string; plantId: string; totalAmount: number };
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe("plant admins see only their own plant", () => {
  it("employees, orders, visits and the live map are limited to the plant, whatever ?plantId says", async () => {
    const orderA = await placeOrder(empA);
    const orderB = await placeOrder(empB);
    expect(orderA.plantId).toBe(f.plantA.id);

    const employees = await api().get(`/api/employees?plantId=${f.plantB.id}`).set(bearer(adminA));
    expect(ids(employees.body.employees)).toEqual([f.empA.id]);

    const orders = await api().get(`/api/orders?plantId=${f.plantB.id}`).set(bearer(adminA));
    expect(ids(orders.body.orders)).toEqual([orderA.id]);

    const live = await api().get("/api/tracking/live").set(bearer(adminB));
    expect(live.body.locations.map((l: { userId: string }) => l.userId)).toEqual([f.empB.id]);

    const all = await api().get("/api/orders").set(bearer(superAdmin));
    expect(ids(all.body.orders)).toEqual([orderA.id, orderB.id].sort());
    const picked = await api().get(`/api/orders?plantId=${f.plantB.id}`).set(bearer(superAdmin));
    expect(ids(picked.body.orders)).toEqual([orderB.id]);
  });

  it("another plant's order, employee or attendance is not found", async () => {
    const orderB = await placeOrder(empB);
    expect((await api().get(`/api/orders/${orderB.id}`).set(bearer(adminA))).status).toBe(404);
    const status = await api().patch(`/api/orders/${orderB.id}/status`).set(bearer(adminA)).send({ status: "confirmed" });
    expect(status.status).toBe(404);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderB.id } })).status).toBe("pending");

    const patch = await api().patch(`/api/employees/${f.empB.id}`).set(bearer(adminA)).send({ active: false });
    expect(patch.status).toBe(404);
    const pw = await api().post(`/api/employees/${f.empB.id}/password`).set(bearer(adminA)).send({ password: "hijack" });
    expect(pw.status).toBe(404);
    expect((await api().get("/api/employees/code/RLX-MDU-001/attendance").set(bearer(adminA))).status).toBe(404);
    expect((await api().get("/api/employees/code/RLX-MDU-001/attendance").set(bearer(adminB))).status).toBe(200);
  });

  it("reports count only the plant; the super admin also gets plants side by side", async () => {
    await placeOrder(empA);
    await placeOrder(empB);
    await placeOrder(empB);

    const a = await api().get("/api/reports/summary").set(bearer(adminA));
    expect(a.body.totalOrders).toBe(1);
    expect(a.body.activeEmployees).toBe(1);
    expect(a.body.plantComparison).toBeUndefined();

    const all = await api().get("/api/reports/summary").set(bearer(superAdmin));
    expect(all.body.totalOrders).toBe(3);
    const byCode = Object.fromEntries(
      all.body.plantComparison.map((p: { code: string; ordersCount: number }) => [p.code, p.ordersCount])
    );
    expect(byCode).toEqual({ CHN: 1, MDU: 2 });
  });

  it("only the super admin manages plants and plant admins", async () => {
    expect((await api().get("/api/admins").set(bearer(adminA))).status).toBe(403);
    expect((await api().post("/api/plants").set(bearer(adminA)).send({ name: "X", code: "XX" })).status).toBe(403);
    const mine = await api().get("/api/plants").set(bearer(adminA));
    expect(ids(mine.body.plants)).toEqual([f.plantA.id]);
    expect((await api().get("/api/plants").set(bearer(empA))).status).toBe(403);
  });
});

describe("staff and codes", () => {
  it("a plant admin adds staff to their own plant only", async () => {
    const created = await api()
      .post("/api/employees")
      .set(bearer(adminA))
      .send({ name: "Rep", phone: "9000000011", password: "abcd", districtId: f.chennai.id });
    expect(created.status).toBe(201);
    expect(created.body.employee).toMatchObject({ plantId: f.plantA.id, employeeCode: "RLX-CHN-002" });

    const elsewhere = await api()
      .post("/api/employees")
      .set(bearer(adminA))
      .send({ name: "Rep", phone: "9000000012", password: "abcd", districtId: f.chennai.id, plantId: f.plantB.id });
    expect(elsewhere.status).toBe(403);

    const noPlant = await api()
      .post("/api/employees")
      .set(bearer(superAdmin))
      .send({ name: "Rep", phone: "9000000013", password: "abcd", districtId: f.chennai.id });
    expect(noPlant.status).toBe(400);
  });

  it("only the super admin transfers staff, and the transfer gives a code at the new plant", async () => {
    const byPlantAdmin = await api().patch(`/api/employees/${f.empA.id}`).set(bearer(adminA)).send({ plantId: f.plantB.id });
    expect(byPlantAdmin.status).toBe(403);

    const order = await placeOrder(empA);
    const moved = await api().patch(`/api/employees/${f.empA.id}`).set(bearer(superAdmin)).send({ plantId: f.plantB.id });
    expect(moved.status).toBe(200);
    expect(moved.body.employee).toMatchObject({ plantId: f.plantB.id, employeeCode: "RLX-MDU-002" });
    // The order taken before the move stays with the old plant.
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).plantId).toBe(f.plantA.id);
  });

  it("changing a plant's code renames its employee codes", async () => {
    const res = await api().patch(`/api/plants/${f.plantA.id}`).set(bearer(superAdmin)).send({ code: "chn2" });
    expect(res.status).toBe(400);
    const ok = await api().patch(`/api/plants/${f.plantA.id}`).set(bearer(superAdmin)).send({ code: "mas" });
    expect(ok.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.empA.id } })).employeeCode).toBe("RLX-MAS-001");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: f.empB.id } })).employeeCode).toBe("RLX-MDU-001");
  });

  it("a plant with people in it can't be deleted; an empty one can", async () => {
    expect((await api().delete(`/api/plants/${f.plantA.id}`).set(bearer(superAdmin))).status).toBe(409);
    const empty = await api().post("/api/plants").set(bearer(superAdmin)).send({ name: "Salem Plant", code: "SLM" });
    expect(empty.status).toBe(201);
    expect((await api().delete(`/api/plants/${empty.body.plant.id}`).set(bearer(superAdmin))).status).toBe(204);
  });

  it("a new plant admin can log in and is limited to their plant", async () => {
    const created = await api()
      .post("/api/admins")
      .set(bearer(superAdmin))
      .send({ name: "MDU Head", phone: "9888888883", password: "longenough", plantId: f.plantB.id });
    expect(created.status).toBe(201);
    const token = (await login("9888888883", "longenough")).accessToken;
    const employees = await api().get("/api/employees").set(bearer(token));
    expect(ids(employees.body.employees)).toEqual([f.empB.id]);
  });

  it("deactivating someone locks them out on their next request", async () => {
    await api().patch(`/api/admins/${f.adminA.id}`).set(bearer(superAdmin)).send({ active: false });
    expect((await api().get("/api/employees").set(bearer(adminA))).status).toBe(401);
  });
});

describe("plant prices", () => {
  it("a plant's own price is what its salespeople see and are charged; other plants keep the company price", async () => {
    const set = await api()
      .put(`/api/products/variants/${f.v1L.id}/plant-price`)
      .set(bearer(adminA))
      .send({ price: 450 });
    expect(set.status).toBe(200);
    expect(set.body.variant).toMatchObject({ price: 450, basePrice: 500, plantPrice: 450 });

    const priceIn = async (token: string) => {
      const res = await api().get("/api/products").set(bearer(token));
      const product = res.body.products.find((p: { id: string }) => p.id === f.product.id);
      return product.variants.find((v: { id: string }) => v.id === f.v1L.id).price;
    };
    expect(await priceIn(empA)).toBe(450);
    expect(await priceIn(empB)).toBe(500);

    expect((await placeOrder(empA)).totalAmount).toBe(900);
    expect((await placeOrder(empB)).totalAmount).toBe(1000);

    const reset = await api()
      .put(`/api/products/variants/${f.v1L.id}/plant-price`)
      .set(bearer(adminA))
      .send({ price: null });
    expect(reset.body.variant.price).toBe(500);
  });

  it("a plant admin can't price another plant or change company prices", async () => {
    const other = await api()
      .put(`/api/products/variants/${f.v1L.id}/plant-price`)
      .set(bearer(adminA))
      .send({ price: 1, plantId: f.plantB.id });
    expect(other.status).toBe(403);
    const base = await api().patch(`/api/products/variants/${f.v1L.id}`).set(bearer(adminA)).send({ price: 1 });
    expect(base.status).toBe(403);
    const salesperson = await api()
      .put(`/api/products/variants/${f.v1L.id}/plant-price`)
      .set(bearer(empA))
      .send({ price: 1 });
    expect(salesperson.status).toBe(403);
  });

  it("the super admin prices any plant, naming it", async () => {
    const res = await api()
      .put(`/api/products/variants/${f.v1L.id}/plant-price`)
      .set(bearer(superAdmin))
      .send({ price: 520, plantId: f.plantB.id });
    expect(res.status).toBe(200);
    const view = await api().get(`/api/products?plantId=${f.plantB.id}`).set(bearer(superAdmin));
    const v = view.body.products[0].variants.find((x: { id: string }) => x.id === f.v1L.id);
    expect(v).toMatchObject({ price: 520, plantPrice: 520, basePrice: 500 });
  });
});

describe("stores", () => {
  const store = { name: "Sri Murugan Paints", lat: 13.05, lng: 80.21, phone: "9876543210" };

  it("a plant admin's stores go into their plant and only they and the super admin see them", async () => {
    const created = await api().post("/api/stores").set(bearer(adminA)).send(store);
    expect(created.status).toBe(201);
    expect(created.body.store).toMatchObject({ plantId: f.plantA.id, name: store.name });

    expect((await api().get("/api/stores").set(bearer(adminB))).body.stores).toEqual([]);
    expect(ids((await api().get("/api/stores").set(bearer(superAdmin))).body.stores)).toEqual([created.body.store.id]);
    expect(ids((await api().get("/api/stores").set(bearer(empA))).body.stores)).toEqual([created.body.store.id]);
    expect((await api().get("/api/stores").set(bearer(empB))).body.stores).toEqual([]);

    const id = created.body.store.id;
    expect((await api().patch(`/api/stores/${id}`).set(bearer(adminB)).send({ name: "X" })).status).toBe(404);
    expect((await api().delete(`/api/stores/${id}`).set(bearer(adminB))).status).toBe(404);
    expect((await api().post("/api/stores").set(bearer(empA)).send(store)).status).toBe(403);
    expect((await api().delete(`/api/stores/${id}`).set(bearer(adminA))).status).toBe(204);
  });

  it("the super admin names the plant for a new store", async () => {
    expect((await api().post("/api/stores").set(bearer(superAdmin)).send(store)).status).toBe(400);
    const res = await api().post("/api/stores").set(bearer(superAdmin)).send({ ...store, plantId: f.plantB.id });
    expect(res.status).toBe(201);
    expect(res.body.store.plantId).toBe(f.plantB.id);
  });

  it("reads coordinates from a pasted Google Maps link", async () => {
    const res = await api()
      .post("/api/stores/resolve-location")
      .set(bearer(adminA))
      .send({ input: "https://www.google.com/maps/place/Shop/@13.0,80.0,17z/data=!3m1!4b1!4m6!3m5!3d13.0827!4d80.2707" });
    expect(res.status).toBe(200);
    expect(res.body.location).toEqual({ lat: 13.0827, lng: 80.2707 });

    const bad = await api().post("/api/stores/resolve-location").set(bearer(adminA)).send({ input: "http://10.0.0.1/x" });
    expect(bad.status).toBe(422);
  });
});

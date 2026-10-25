import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { api, bearer, ensureSocket, login, putOnDuty, resetDb, seedFixtures, type Fixtures } from "./helpers";

ensureSocket();

let f: Fixtures;
let empA: string;
let empB: string;
let adminA: string;
let adminB: string;
let superAdmin: string;
beforeEach(async () => {
  await resetDb();
  f = await seedFixtures();
  await putOnDuty(f.empA.id);
  empA = (await login("9000000001")).accessToken;
  empB = (await login("9000000002")).accessToken;
  adminA = (await login("9888888881")).accessToken;
  adminB = (await login("9888888882")).accessToken;
  superAdmin = (await login("9999999999")).accessToken;
});
afterAll(() => prisma.$disconnect());

const shop = { name: "Sri Murugan Paints", ownerName: "Murugan", phone: "9876543210", lat: 13.05, lng: 80.21 };
const storeNames = async (token: string) =>
  ((await api().get("/api/stores").set(bearer(token))).body.stores as { name: string }[]).map((s) => s.name);

describe("shops added from the field", () => {
  it("wait for their plant admin's approval before the rest of the team sees them", async () => {
    const added = await api().post("/api/stores/from-field").set(bearer(empA)).send(shop);
    expect(added.status).toBe(201);
    expect(added.body.store).toMatchObject({ status: "pending", plantId: f.plantA.id, createdBy: { id: f.empA.id } });

    // The salesperson who added it sees it; another plant's salesperson doesn't.
    expect(await storeNames(empA)).toEqual([shop.name]);
    expect(await storeNames(empB)).toEqual([]);

    // Only their own plant's admin can approve it.
    expect((await api().post(`/api/stores/${added.body.store.id}/approve`).set(bearer(adminB))).status).toBe(404);
    expect((await api().post(`/api/stores/${added.body.store.id}/approve`).set(bearer(empA))).status).toBe(403);
    const approved = await api().post(`/api/stores/${added.body.store.id}/approve`).set(bearer(adminA));
    expect(approved.status).toBe(200);
    expect(approved.body.store.status).toBe("approved");
  });

  it("a pending shop of someone else is hidden from salespeople", async () => {
    await prisma.user.update({ where: { id: f.empB.id }, data: { plantId: f.plantA.id } });
    await api().post("/api/stores/from-field").set(bearer(empA)).send(shop);
    expect(await storeNames(empB)).toEqual([]);
  });

  it("needs a name and a position", async () => {
    expect((await api().post("/api/stores/from-field").set(bearer(empA)).send({ ...shop, name: "" })).status).toBe(400);
    expect((await api().post("/api/stores/from-field").set(bearer(empA)).send({ name: "X" })).status).toBe(400);
  });
});

describe("importing a dealer list", () => {
  const rows = [
    { name: "Lakshmi Hardware", phone: "+91 98765 43210", location: "13.0827, 80.2707" },
    { name: "Ganesh Paints", lat: 13.1, lng: 80.3, address: "Anna Nagar" },
    { name: "No Place Traders" },
    { name: "", location: "13.2, 80.2" },
    { name: "lakshmi  hardware", location: "13.08271, 80.27071" },
  ];

  it("creates the placeable rows, skips duplicates and reports the rest by spreadsheet row", async () => {
    const res = await api().post("/api/stores/import").set(bearer(adminA)).send({ rows });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: 2, skipped: 1, failed: 2 });
    expect(res.body.results.map((r: { row: number; status: string }) => [r.row, r.status])).toEqual([
      [2, "created"],
      [3, "created"],
      [4, "error"],
      [5, "error"],
      [6, "skipped"],
    ]);
    const lakshmi = await prisma.store.findFirstOrThrow({ where: { name: "Lakshmi Hardware" } });
    expect(lakshmi).toMatchObject({ phone: "9876543210", status: "approved", plantId: f.plantA.id });

    // Importing the same file again adds nothing.
    const again = await api().post("/api/stores/import").set(bearer(adminA)).send({ rows });
    expect(again.body).toMatchObject({ created: 0, skipped: 3 });
  });

  it("the super admin has to pick the plant; salespeople can't import", async () => {
    expect((await api().post("/api/stores/import").set(bearer(superAdmin)).send({ rows })).status).toBe(400);
    const ok = await api().post("/api/stores/import").set(bearer(superAdmin)).send({ rows, plantId: f.plantB.id });
    expect(ok.body.created).toBe(2);
    expect((await api().post("/api/stores/import").set(bearer(empA)).send({ rows })).status).toBe(403);
  });
});

describe("in-person and phone orders", () => {
  async function approvedShop() {
    return prisma.store.create({ data: { ...shop, plantId: f.plantA.id } });
  }
  const order = (extra: Record<string, unknown>) =>
    api()
      .post("/api/orders")
      .set(bearer(empA))
      .send({ customerName: "Murugan", items: [{ variantId: f.v1L.id, quantity: 1 }], ...extra });

  it("an in-person order records how far the phone was from the shop", async () => {
    const s = await approvedShop();
    // About 1.1 km north of the shop.
    const res = await order({ storeId: s.id, lat: 13.06, lng: 80.21 });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ channel: "in_person", storeId: s.id, shopName: shop.name });
    expect(res.body.order.distanceFromStoreM).toBeGreaterThan(1000);
    expect(res.body.order.distanceFromStoreM).toBeLessThan(1200);
  });

  it("refuses a phone order", async () => {
    const s = await approvedShop();
    const res = await order({ storeId: s.id, channel: "phone", lat: 12.9, lng: 80.1 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Orders can only be taken at the shop");
  });

  it("refuses another plant's shop", async () => {
    const other = await prisma.store.create({ data: { ...shop, plantId: f.plantB.id } });
    expect((await order({ storeId: other.id })).status).toBe(400);
  });
});

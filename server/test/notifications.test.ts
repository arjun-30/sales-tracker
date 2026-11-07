import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { flushMessages } from "../src/lib/messaging";
import { api, bearer, ensureSocket, login, putOnDuty, resetDb, seedFixtures, type Fixtures } from "./helpers";

ensureSocket();

let f: Fixtures;
let empA: string;
let empB: string;
let adminA: string;
beforeEach(async () => {
  await resetDb();
  f = await seedFixtures();
  await putOnDuty(f.empA.id);
  empA = (await login("9000000001")).accessToken;
  empB = (await login("9000000002")).accessToken;
  adminA = (await login("9888888881")).accessToken;
});
afterAll(() => prisma.$disconnect());

const OWNER = "9876543210";
const shop = { name: "Sri Murugan Paints", ownerName: "Murugan", phone: OWNER, lat: 13.05, lng: 80.21 };
const sendCode = (token: string, phone = OWNER) =>
  api().post("/api/stores/phone-code").set(bearer(token)).send({ phone, shopName: shop.name });
const messages = async () => {
  await flushMessages();
  return prisma.outboundMessage.findMany({ orderBy: { createdAt: "asc" } });
};

describe("SMS code for a shop added from the field", () => {
  it("goes to the owner's number and must be typed in to add the shop", async () => {
    const sent = await sendCode(empA);
    expect(sent.status).toBe(200);
    expect(sent.body.devCode).toMatch(/^\d{6}$/);
    const sms = await messages();
    expect(sms).toHaveLength(1);
    expect(sms[0]).toMatchObject({ channel: "sms", kind: "store_otp", to: OWNER, plantId: f.plantA.id, status: "logged" });
    expect(sms[0].body).toContain(sent.body.devCode);

    const added = await api().post("/api/stores/from-field").set(bearer(empA)).send({ ...shop, code: sent.body.devCode });
    expect(added.status).toBe(201);
    expect(added.body.store.phoneVerifiedAt).toBeTruthy();

    // The code is used up.
    const again = await api().post("/api/stores/from-field").set(bearer(empA)).send({ ...shop, code: sent.body.devCode });
    expect(again.status).toBe(400);
  });

  it("refuses a shop without a number, without a code, or with a wrong code", async () => {
    const { phone: _phone, ...noPhone } = shop;
    expect((await api().post("/api/stores/from-field").set(bearer(empA)).send({ ...noPhone, code: "123456" })).status).toBe(400);
    expect((await api().post("/api/stores/from-field").set(bearer(empA)).send(shop)).status).toBe(400);

    const sent = await sendCode(empA);
    const wrong = sent.body.devCode === "000000" ? "111111" : "000000";
    const res = await api().post("/api/stores/from-field").set(bearer(empA)).send({ ...shop, code: wrong });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/wrong/);
    expect(await prisma.store.count()).toBe(0);
  });

  it("locks the code after five wrong tries", async () => {
    const sent = await sendCode(empA);
    const wrong = sent.body.devCode === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) {
      await api().post("/api/stores/from-field").set(bearer(empA)).send({ ...shop, code: wrong });
    }
    const right = await api().post("/api/stores/from-field").set(bearer(empA)).send({ ...shop, code: sent.body.devCode });
    expect(right.status).toBe(400);
    expect(right.body.error).toMatch(/Too many/);
  });

  it("only works for the salesperson who asked for it", async () => {
    await prisma.user.update({ where: { id: f.empB.id }, data: { plantId: f.plantA.id } });
    const sent = await sendCode(empA);
    const res = await api().post("/api/stores/from-field").set(bearer(empB)).send({ ...shop, code: sent.body.devCode });
    expect(res.status).toBe(400);
  });

  it("can't be sent again within 30 seconds", async () => {
    expect((await sendCode(empA)).status).toBe(200);
    expect((await sendCode(empA)).status).toBe(429);
  });

  it("is only for salespeople, to a 10-digit number", async () => {
    expect((await sendCode(adminA)).status).toBe(403);
    expect((await sendCode(empA, "12345")).status).toBe(400);
  });
});

describe("messages after an order", () => {
  it("SMS the owner and the plant admins, and send the order PDF on WhatsApp", async () => {
    const store = await prisma.store.create({ data: { ...shop, plantId: f.plantA.id } });
    const res = await api()
      .post("/api/orders")
      .set(bearer(empA))
      .send({ customerName: "Murugan", storeId: store.id, lat: 13.05, lng: 80.21, items: [{ variantId: f.v1L.id, quantity: 2 }] });
    expect(res.status).toBe(201);

    const sent = await messages();
    const byKind = (k: string) => sent.filter((m) => m.kind === k);
    expect(byKind("order_owner")).toMatchObject([{ to: OWNER, channel: "sms", orderId: res.body.order.id }]);
    expect(byKind("order_owner")[0].body).toContain("Rs 1,000");
    expect(byKind("order_pdf")).toMatchObject([{ to: OWNER, channel: "whatsapp" }]);
    // Plant A's admin only: not plant B's, not the super admin.
    expect(byKind("order_admin").map((m) => m.to)).toEqual([f.adminA.phone]);
  });

  it("go to the phone typed on the order when it is not for a shop on the map", async () => {
    await api()
      .post("/api/orders")
      .set(bearer(empA))
      .send({ customerName: "Walk-in", customerPhone: "9123456789", items: [{ variantId: f.v1L.id, quantity: 1 }] });
    const owner = (await messages()).filter((m) => m.kind === "order_owner");
    expect(owner.map((m) => m.to)).toEqual(["9123456789"]);
  });

  it("the order PDF can be downloaded by the office", async () => {
    const res = await api()
      .post("/api/orders")
      .set(bearer(empA))
      .send({ customerName: "Murugan", items: [{ variantId: f.v4L.id, quantity: 1 }] });
    const pdf = await api().get(`/api/orders/${res.body.order.id}/pdf`).set(bearer(adminA));
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toBe("application/pdf");
    expect(pdf.body.subarray(0, 4).toString()).toBe("%PDF");
    // Another plant's salesperson can't.
    expect((await api().get(`/api/orders/${res.body.order.id}/pdf`).set(bearer(empB))).status).toBe(404);
  });
});

describe("messages after a visit", () => {
  async function visit(storeId: string, order = false) {
    const checkIn = await api().post("/api/visits/checkin").set(bearer(empA)).send({ storeId, lat: 13.05, lng: 80.21 });
    expect(checkIn.status).toBe(201);
    if (order) {
      await api()
        .post("/api/orders")
        .set(bearer(empA))
        .send({ customerName: "Murugan", storeId, items: [{ variantId: f.v1L.id, quantity: 1 }] });
    }
    await api().post(`/api/visits/${checkIn.body.visit.id}/checkout`).set(bearer(empA)).send({ lat: 13.05, lng: 80.21 });
    return checkIn.body.visit;
  }

  it("without an order, tell the owner and the plant admins", async () => {
    const store = await prisma.store.create({ data: { ...shop, plantId: f.plantA.id } });
    const v = await visit(store.id);
    expect(v.shopName).toBe(shop.name);
    const sent = await messages();
    expect(sent.map((m) => [m.kind, m.to])).toEqual(
      expect.arrayContaining([
        ["visit_owner", OWNER],
        ["visit_admin", f.adminA.phone],
      ])
    );
    expect(sent).toHaveLength(2);
  });

  it("with an order, send only the order messages", async () => {
    const store = await prisma.store.create({ data: { ...shop, plantId: f.plantA.id } });
    await visit(store.id, true);
    const kinds = (await messages()).map((m) => m.kind);
    expect(kinds).not.toContain("visit_owner");
    expect(kinds).not.toContain("visit_admin");
    expect(kinds).toContain("order_owner");
  });

  it("can't check in to another plant's shop", async () => {
    const other = await prisma.store.create({ data: { ...shop, plantId: f.plantB.id } });
    const res = await api().post("/api/visits/checkin").set(bearer(empA)).send({ storeId: other.id, lat: 13.05, lng: 80.21 });
    expect(res.status).toBe(400);
  });

  it("the office sees the message log, with shop codes hidden", async () => {
    await sendCode(empA);
    await messages();
    const res = await api().get("/api/messages").set(bearer(adminA));
    expect(res.status).toBe(200);
    expect(res.body.messages[0].body).toMatch(/^\*{6} is your Roalux/);
    expect(res.body.providers).toEqual({ sms: "log", whatsapp: "log" });
    expect((await api().get("/api/messages").set(bearer(empA))).status).toBe(403);
  });
});

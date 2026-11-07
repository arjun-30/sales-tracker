import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { flushMessages } from "../src/lib/messaging";
import { gstinCheckChar, gstinProblem } from "../src/lib/gstin";
import { dayEndToday, sweepDayEnd } from "../src/lib/dutySweep";
import { startDutySession } from "../src/lib/duty";
import { api, bearer, ensureSocket, login, putOnDuty, resetDb, seedFixtures, type Fixtures } from "./helpers";

ensureSocket();

let f: Fixtures;
let empA: string;
let adminA: string;
let superAdmin: string;
beforeEach(async () => {
  await resetDb();
  f = await seedFixtures();
  await putOnDuty(f.empA.id);
  empA = (await login("9000000001")).accessToken;
  adminA = (await login("9888888881")).accessToken;
  superAdmin = (await login("9999999999")).accessToken;
});
afterEach(() => {
  process.env.DUTY_DAY_END_HOUR = "24";
});
afterAll(() => prisma.$disconnect());

const OWNER = "9876543210";
// A real, published GSTIN layout with a valid check character.
const GSTIN = "27AAPFU0939F1ZV";
const shop = { name: "Sri Murugan Paints", ownerName: "Murugan", phone: OWNER, lat: 13.05, lng: 80.25 };

const messages = async () => {
  await flushMessages();
  return prisma.outboundMessage.findMany({ orderBy: { createdAt: "asc" } });
};
const checkIn = (storeId: string) =>
  api().post("/api/visits/checkin").set(bearer(empA)).send({ storeId, lat: 13.05, lng: 80.25 });
const order = (body: Record<string, unknown> = {}) =>
  api()
    .post("/api/orders")
    .set(bearer(empA))
    .send({ customerName: "Murugan", lat: 13.05, lng: 80.25, items: [{ variantId: f.v1L.id, quantity: 2 }], ...body });

describe("GSTIN check", () => {
  it("accepts a valid GSTIN and finds typing mistakes", () => {
    expect(gstinProblem(GSTIN)).toBeNull();
    expect(gstinProblem(GSTIN.toLowerCase())).toBeNull();
    expect(gstinProblem("27AAPFU0939F1ZW")).toMatch(/typing mistake/);
    expect(gstinProblem("27AAPFU0939F1Z")).toMatch(/15 characters/);
    expect(gstinProblem("40AAPFU0939F1ZV")).toMatch(/state code/);
    const tn = "33AAACR5055K1Z";
    expect(gstinProblem(tn + gstinCheckChar(tn))).toBeNull();
  });

  it("refuses an order with a mistyped GSTIN and keeps a good one on the shop", async () => {
    const store = await prisma.store.create({ data: { ...shop, plantId: f.plantA.id } });
    const bad = await order({ storeId: store.id, gstin: "27AAPFU0939F1ZW" });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/typing mistake/);

    const ok = await order({ storeId: store.id, gstin: "27aapfu0939f1zv" });
    expect(ok.status).toBe(201);
    expect(ok.body.order.gstin).toBe(GSTIN);
    expect((await prisma.store.findUniqueOrThrow({ where: { id: store.id } })).gstin).toBe(GSTIN);

    // Next time the shop's GSTIN is used without typing it.
    const again = await order({ storeId: store.id });
    expect(again.body.order.gstin).toBe(GSTIN);
  });

  it("refuses a shop saved with a bad GSTIN", async () => {
    const res = await api()
      .post("/api/stores")
      .set(bearer(adminA))
      .send({ ...shop, gstin: "33ABCDE1234F1Z0" });
    expect(res.status).toBe(400);
  });
});

describe("order under the checked-in shop", () => {
  it("fills in the shop and the visit when the app sends none", async () => {
    const store = await prisma.store.create({ data: { ...shop, plantId: f.plantA.id } });
    const visit = (await checkIn(store.id)).body.visit;
    const res = await order();
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({ storeId: store.id, visitId: visit.id, shopName: shop.name });
  });

  it("refuses an order for another shop while checked in", async () => {
    const store = await prisma.store.create({ data: { ...shop, plantId: f.plantA.id } });
    const other = await prisma.store.create({ data: { ...shop, name: "Other Paints", plantId: f.plantA.id } });
    await checkIn(store.id);
    const res = await order({ storeId: other.id });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/checked in at Sri Murugan Paints/);
  });
});

describe("shades", () => {
  it("super admin adds shades, the app sees them, and the order line keeps the name", async () => {
    const created = await api()
      .post(`/api/products/${f.product.id}/shades`)
      .set(bearer(superAdmin))
      .send({ name: "Ivory", code: "2041", hex: "#efe6d2" });
    expect(created.status).toBe(201);
    const dup = await api().post(`/api/products/${f.product.id}/shades`).set(bearer(superAdmin)).send({ name: "Ivory" });
    expect(dup.status).toBe(409);
    const asPlantAdmin = await api().post(`/api/products/${f.product.id}/shades`).set(bearer(adminA)).send({ name: "Red" });
    expect(asPlantAdmin.status).toBe(403);

    const catalogue = await api().get("/api/products").set(bearer(empA));
    expect(catalogue.body.products[0].shades.map((s: { name: string }) => s.name)).toEqual(["Ivory"]);

    const res = await order({ items: [{ variantId: f.v1L.id, quantity: 1, shadeId: created.body.shade.id }] });
    expect(res.status).toBe(201);
    expect(res.body.order.items[0].shadeName).toBe("Ivory (2041)");

    // Switched off: no longer offered, old order still reads.
    await api().patch(`/api/products/shades/${created.body.shade.id}`).set(bearer(superAdmin)).send({ active: false });
    const after = await api().get("/api/products").set(bearer(empA));
    expect(after.body.products[0].shades).toEqual([]);
    const refused = await order({ items: [{ variantId: f.v1L.id, quantity: 1, shadeId: created.body.shade.id }] });
    expect(refused.status).toBe(400);
  });

  it("refuses a shade of a different product", async () => {
    const other = await prisma.product.create({ data: { name: "Enamel", shortCode: "ENM", category: "Enamel" } });
    const shade = await prisma.productShade.create({ data: { productId: other.id, name: "Signal Red" } });
    const res = await order({ items: [{ variantId: f.v1L.id, quantity: 1, shadeId: shade.id }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not a colour of that product/);
  });
});

describe("checkout with payment and next visit", () => {
  it("records the payment, sets the shop's next visit and sends the owner a receipt", async () => {
    const store = await prisma.store.create({ data: { ...shop, plantId: f.plantA.id } });
    const visit = (await checkIn(store.id)).body.visit;
    const res = await api()
      .post(`/api/visits/${visit.id}/checkout`)
      .set(bearer(empA))
      .send({ lat: 13.05, lng: 80.25, paymentAmount: 2500, paymentMode: "cheque", paymentRef: "004512", nextVisitOn: "2099-01-15" });
    expect(res.status).toBe(200);
    expect(res.body.visit).toMatchObject({ paymentAmount: 2500, paymentMode: "cheque", paymentRef: "004512" });
    const saved = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
    expect(saved.nextVisitOn?.toISOString().slice(0, 10)).toBe("2099-01-15");

    const receipt = (await messages()).find((m) => m.kind === "payment_owner");
    expect(receipt?.body).toContain("Received Rs 2,500 by cheque (004512)");
  });

  it("needs a cheque number and a future next-visit date", async () => {
    const store = await prisma.store.create({ data: { ...shop, plantId: f.plantA.id } });
    const visit = (await checkIn(store.id)).body.visit;
    const noCheque = await api()
      .post(`/api/visits/${visit.id}/checkout`)
      .set(bearer(empA))
      .send({ lat: 13, lng: 80, paymentAmount: 100, paymentMode: "cheque" });
    expect(noCheque.body.error).toMatch(/cheque number/);
    const past = await api()
      .post(`/api/visits/${visit.id}/checkout`)
      .set(bearer(empA))
      .send({ lat: 13, lng: 80, nextVisitOn: "2020-01-01" });
    expect(past.body.error).toMatch(/after today/);
  });

  it("sends the owner nothing when the salesperson turns the SMS off", async () => {
    const store = await prisma.store.create({ data: { ...shop, plantId: f.plantA.id } });
    const visit = (await checkIn(store.id)).body.visit;
    await api()
      .post(`/api/visits/${visit.id}/checkout`)
      .set(bearer(empA))
      .send({ lat: 13, lng: 80, paymentAmount: 500, paymentMode: "cash", notifyOwner: false });
    const sent = await messages();
    expect(sent.filter((m) => m.to === OWNER)).toEqual([]);
    // The admins still hear about the visit.
    expect(sent.some((m) => m.kind === "visit_admin")).toBe(true);
  });
});

describe("supply and delivery", () => {
  async function newOrder() {
    const store = await prisma.store.create({ data: { ...shop, plantId: f.plantA.id } });
    return (await order({ storeId: store.id })).body.order as { id: string };
  }
  const setStatus = (id: string, body: Record<string, unknown>) =>
    api().patch(`/api/orders/${id}/status`).set(bearer(adminA)).send(body);

  it("goes confirmed, dispatched, delivered with vehicle, dates and owner SMS", async () => {
    const o = await newOrder();
    expect((await setStatus(o.id, { status: "confirmed" })).body.order.confirmedAt).toBeTruthy();

    const noVehicle = await setStatus(o.id, { status: "dispatched" });
    expect(noVehicle.status).toBe(400);
    const dispatched = await setStatus(o.id, {
      status: "dispatched",
      vehicleNo: "tn 09 ab 1234",
      driverName: "Selvam",
      driverPhone: "9123456780",
    });
    expect(dispatched.body.order).toMatchObject({ status: "dispatched", vehicleNo: "TN 09 AB 1234", driverName: "Selvam" });

    const delivered = await setStatus(o.id, { status: "delivered", deliveryNote: "Received by owner" });
    expect(delivered.body.order).toMatchObject({ status: "delivered", deliveryNote: "Received by owner" });
    expect(delivered.body.order.deliveredAt).toBeTruthy();

    const owner = (await messages()).filter((m) => m.to === OWNER).map((m) => m.kind);
    expect(owner).toEqual(expect.arrayContaining(["order_confirmed_owner", "order_dispatched_owner"]));
    const thanks = (await messages()).find((m) => m.kind === "order_confirmed_owner");
    expect(thanks?.body).toMatch(/^Roalux: Thank you, Sri Murugan Paints\. Your order RLX-/);
  });

  it("refuses skipping dispatch backwards and stores a delivery photo", async () => {
    const o = await newOrder();
    expect((await setStatus(o.id, { status: "dispatched", vehicleNo: "TN01" })).status).toBe(409);

    const png = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8ff1f0003030200ef9b8f4d0000000049454e44ae426082", "hex");
    const up = await api()
      .put(`/api/orders/${o.id}/delivery-proof`)
      .set(bearer(adminA))
      .attach("photo", png, { filename: "slip.png", contentType: "image/png" });
    expect(up.status).toBe(204);
    const got = await api().get(`/api/orders/${o.id}/delivery-proof`).set(bearer(adminA));
    expect(got.status).toBe(200);
    expect(got.headers["content-type"]).toBe("image/png");
  });
});

describe("end of duty at 9 pm", () => {
  it("switches everyone off duty with hours stopping at 9 pm", async () => {
    process.env.DUTY_DAY_END_HOUR = "21";
    const at2130 = new Date("2026-11-07T16:00:00.000Z"); // 21:30 IST
    const at1900 = new Date("2026-11-07T13:30:00.000Z"); // 19:00 IST
    await prisma.$transaction((tx) => startDutySession(tx, f.empA.id, at1900));

    expect(await sweepDayEnd(new Date("2026-11-07T15:00:00.000Z"))).toBe(0); // 20:30 IST: too early
    expect(await sweepDayEnd(at2130)).toBe(1);

    const loc = await prisma.employeeLocation.findUniqueOrThrow({ where: { userId: f.empA.id } });
    expect(loc.onDuty).toBe(false);
    const session = await prisma.dutySession.findFirstOrThrow({ where: { userId: f.empA.id } });
    expect(session.endReason).toBe("day_end");
    expect(session.endedAt?.toISOString()).toBe(dayEndToday(at2130).toISOString());
    expect(session.endedAt?.toISOString()).toBe("2026-11-07T15:30:00.000Z");
  });

  it("monthly attendance sheet marks full, half and auto-ended days", async () => {
    await prisma.dutySession.createMany({
      data: [
        // 2 Nov: 09:00-18:00 IST, full day.
        { userId: f.empA.id, startedAt: new Date("2026-11-02T03:30:00Z"), endedAt: new Date("2026-11-02T12:30:00Z"), endReason: "manual" },
        // 3 Nov: 18:00-21:00 IST, half day ended by the 9 pm sweep.
        { userId: f.empA.id, startedAt: new Date("2026-11-03T12:30:00Z"), endedAt: new Date("2026-11-03T15:30:00Z"), endReason: "day_end" },
      ],
    });
    const res = await api().get("/api/reports/attendance?month=2026-11").set(bearer(adminA));
    expect(res.status).toBe(200);
    // Plant A's admin sees only plant A's staff.
    expect(res.body.rows.map((r: { employee: { employeeCode: string } }) => r.employee.employeeCode)).toEqual(["RLX-CHN-001"]);
    const days = res.body.rows[0].days as { date: string; status: string; minutes: number; autoEnded: boolean }[];
    expect(days).toHaveLength(30);
    expect(days[1]).toMatchObject({ date: "2026-11-02", status: "present", minutes: 540 });
    expect(days[2]).toMatchObject({ date: "2026-11-03", status: "half", minutes: 180, autoEnded: true });
    expect(days[3].status).toBe("absent");
    expect(res.body.rows[0]).toMatchObject({ present: 1, half: 1 });
  });
});

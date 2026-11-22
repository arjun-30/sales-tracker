import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db";
import { resetGstVerifyForTests } from "../src/lib/gstVerify";
import { gstinCheckChar } from "../src/lib/gstin";
import { api, bearer, ensureSocket, login, putOnDuty, resetDb, seedFixtures, type Fixtures } from "./helpers";

ensureSocket();

// Valid layouts and check digits; what the "portal" says about each is below.
const withCheck = (first14: string) => first14 + gstinCheckChar(first14);
const ACTIVE = "27AAPFU0939F1ZV";
const CANCELLED = withCheck("33AAACR5055K1Z");
const UNKNOWN = withCheck("33ABCDE1234F1Z");

const taxpayer = {
  lgnm: "SRI MURUGAN PAINTS PRIVATE LIMITED",
  tradeNam: "SRI MURUGAN PAINTS",
  sts: "Active",
  rgdt: "01/07/2017",
  cxdt: "",
  pradr: { addr: { bno: "12", st: "Gandhi Road", loc: "Tirunelveli", dst: "Tirunelveli", stcd: "Tamil Nadu", pncd: "627001", flno: "", lg: "" } },
};

let searches: string[];
let authCalls: number;
let portalDown: boolean;
let expireTokenOnce: boolean;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

// A stand-in for Sandbox's /authenticate and GSTIN search.
async function fakeSandbox(url: string | URL | Request, init?: RequestInit): Promise<Response> {
  if (portalDown) throw new TypeError("fetch failed");
  const path = new URL(String(url)).pathname;
  const headers = new Headers(init?.headers);
  if (path === "/authenticate") {
    authCalls++;
    expect(headers.get("x-api-key")).toBe("test-key");
    expect(headers.get("x-api-secret")).toBe("test-secret");
    return json(200, { code: 200, data: { access_token: `token-${authCalls}` } });
  }
  if (path === "/gst/compliance/public/gstin/search") {
    if (expireTokenOnce) {
      expireTokenOnce = false;
      return json(403, { message: "Invalid token" });
    }
    expect(headers.get("authorization")).toMatch(/^token-\d+$/);
    const { gstin } = JSON.parse(String(init?.body));
    searches.push(gstin);
    if (gstin === ACTIVE) return json(200, { code: 200, data: { data: { ...taxpayer, gstin }, status_cd: "1" } });
    if (gstin === CANCELLED) {
      return json(200, {
        code: 200,
        data: { data: { ...taxpayer, gstin, lgnm: "OLD PAINT HOUSE", sts: "Cancelled", cxdt: "31/03/2024" }, status_cd: "1" },
      });
    }
    return json(200, { code: 200, data: { error: { error_cd: "FO8000", message: "No records found" }, status_cd: "0" } });
  }
  return json(404, { message: "not found" });
}

let f: Fixtures;
let empA: string;
let adminA: string;

beforeEach(async () => {
  await resetDb();
  f = await seedFixtures();
  await putOnDuty(f.empA.id);
  empA = (await login("9000000001")).accessToken;
  adminA = (await login("9888888881")).accessToken;
  searches = [];
  authCalls = 0;
  portalDown = false;
  expireTokenOnce = false;
  resetGstVerifyForTests();
  process.env.GST_VERIFY_PROVIDER = "sandbox";
  process.env.SANDBOX_API_KEY = "test-key";
  process.env.SANDBOX_API_SECRET = "test-secret";
  process.env.SANDBOX_API_URL = "https://sandbox.test";
  vi.stubGlobal("fetch", vi.fn(fakeSandbox));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete process.env.GST_VERIFY_PROVIDER;
});
afterAll(() => prisma.$disconnect());

const check = (gstin: string, token = empA) => api().get(`/api/gstin/${gstin}`).set(bearer(token));
const shop = { name: "Sri Murugan Paints", ownerName: "Murugan", phone: "9876543210", lat: 13.05, lng: 80.25 };
const order = (body: Record<string, unknown> = {}) =>
  api()
    .post("/api/orders")
    .set(bearer(empA))
    .send({ customerName: "Murugan", lat: 13.05, lng: 80.25, items: [{ variantId: f.v1L.id, quantity: 2 }], ...body });

describe("online GSTIN check", () => {
  it("returns the registered name and keeps the answer, so a repeat costs nothing", async () => {
    const res = await check(ACTIVE.toLowerCase());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      result: "verified",
      gstin: ACTIVE,
      status: "Active",
      legalName: "SRI MURUGAN PAINTS PRIVATE LIMITED",
      tradeName: "SRI MURUGAN PAINTS",
      state: "Tamil Nadu",
    });
    expect(res.body.address).toBe("12, Gandhi Road, Tirunelveli, Tamil Nadu, 627001");

    await check(ACTIVE);
    await check(ACTIVE, adminA);
    expect(searches).toEqual([ACTIVE]);
    expect(authCalls).toBe(1);
  });

  it("says a typing mistake without asking the portal", async () => {
    const res = await check("27AAPFU0939F1ZW");
    expect(res.body).toMatchObject({ result: "invalid" });
    expect(res.body.problem).toMatch(/typing mistake/);
    expect(searches).toEqual([]);
  });

  it("flags unregistered and cancelled numbers", async () => {
    const unknown = await check(UNKNOWN);
    expect(unknown.body.result).toBe("invalid");
    expect(unknown.body.problem).toMatch(/No business is registered/);

    const cancelled = await check(CANCELLED);
    expect(cancelled.body.result).toBe("invalid");
    expect(cancelled.body.problem).toMatch(/OLD PAINT HOUSE.*cancelled/);
  });

  it("signs in again once when the token has expired", async () => {
    expireTokenOnce = true;
    const res = await check(ACTIVE);
    expect(res.body.result).toBe("verified");
    expect(authCalls).toBe(2);
  });

  it("lets work go on when the portal is down, and when no provider is set up", async () => {
    portalDown = true;
    const down = await check(ACTIVE);
    expect(down.body).toMatchObject({ result: "unchecked" });
    const ok = await order({ gstin: ACTIVE });
    expect(ok.status).toBe(201);
    expect(ok.body.order).toMatchObject({ gstin: ACTIVE, gstinName: null, gstinStatus: null });

    delete process.env.GST_VERIFY_PROVIDER;
    portalDown = false;
    const off = await check(ACTIVE);
    expect(off.body.result).toBe("unchecked");
    expect(off.body.reason).toMatch(/not set up/);
    expect(searches).toEqual([]);
  });

  it("uses an older answer while the portal is down", async () => {
    await prisma.gstinCheck.create({
      data: { gstin: ACTIVE, found: true, status: "Active", legalName: "SRI MURUGAN PAINTS PRIVATE LIMITED", checkedAt: new Date(2020, 0, 1) },
    });
    portalDown = true;
    const res = await check(ACTIVE);
    expect(res.body).toMatchObject({ result: "verified", legalName: "SRI MURUGAN PAINTS PRIVATE LIMITED" });
  });

  it("re-checks a kept answer once it is older than GST_CHECK_DAYS", async () => {
    await prisma.gstinCheck.create({
      data: { gstin: ACTIVE, found: true, status: "Active", legalName: "OLD NAME", checkedAt: new Date(2020, 0, 1) },
    });
    const res = await check(ACTIVE);
    expect(res.body.legalName).toBe("SRI MURUGAN PAINTS PRIVATE LIMITED");
    expect(searches).toEqual([ACTIVE]);
  });
});

describe("orders and shops", () => {
  it("refuses an order with a cancelled or unregistered GSTIN", async () => {
    const cancelled = await order({ gstin: CANCELLED });
    expect(cancelled.status).toBe(400);
    expect(cancelled.body.error).toMatch(/cancelled/);

    const unknown = await order({ gstin: UNKNOWN });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error).toMatch(/No business is registered/);
    expect(await prisma.order.count()).toBe(0);
  });

  it("keeps the registered name on the order and the shop", async () => {
    const store = await prisma.store.create({ data: { ...shop, plantId: f.plantA.id } });
    const res = await order({ storeId: store.id, gstin: ACTIVE });
    expect(res.status).toBe(201);
    expect(res.body.order).toMatchObject({
      gstin: ACTIVE,
      gstinName: "SRI MURUGAN PAINTS PRIVATE LIMITED",
      gstinStatus: "Active",
    });
    const saved = await prisma.store.findUniqueOrThrow({ where: { id: store.id } });
    expect(saved).toMatchObject({ gstin: ACTIVE, gstinName: "SRI MURUGAN PAINTS PRIVATE LIMITED", gstinStatus: "Active" });
    expect(saved.gstinCheckedAt).toBeInstanceOf(Date);
  });

  it("refuses an order for a shop whose saved GSTIN has since been cancelled", async () => {
    const store = await prisma.store.create({ data: { ...shop, plantId: f.plantA.id, gstin: CANCELLED } });
    const res = await order({ storeId: store.id });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cancelled/);
  });

  it("checks the GSTIN when the office adds or edits a shop", async () => {
    const bad = await api().post("/api/stores").set(bearer(adminA)).send({ ...shop, gstin: CANCELLED });
    expect(bad.status).toBe(400);
    expect(bad.body.error).toMatch(/cancelled/);

    const created = await api().post("/api/stores").set(bearer(adminA)).send({ ...shop, gstin: ACTIVE });
    expect(created.status).toBe(201);
    expect(created.body.store).toMatchObject({ gstinName: "SRI MURUGAN PAINTS PRIVATE LIMITED", gstinStatus: "Active" });

    // Editing other details doesn't ask the portal again.
    searches = [];
    const renamed = await api().patch(`/api/stores/${created.body.store.id}`).set(bearer(adminA)).send({ name: "Murugan Paints", gstin: ACTIVE });
    expect(renamed.status).toBe(200);
    expect(searches).toEqual([]);

    const unknown = await api().patch(`/api/stores/${created.body.store.id}`).set(bearer(adminA)).send({ gstin: UNKNOWN });
    expect(unknown.status).toBe(400);

    const cleared = await api().patch(`/api/stores/${created.body.store.id}`).set(bearer(adminA)).send({ gstin: null });
    expect(cleared.body.store).toMatchObject({ gstin: null, gstinName: null, gstinStatus: null });
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { sweepStaleDuty } from "../src/lib/dutySweep";
import { normalizeEmployeeCode, workedByDay } from "../src/lib/attendance";
import { api, bearer, ensureSocket, login, putOnDuty, resetDb, seedFixtures, type Fixtures } from "./helpers";

// IST is UTC+5:30, so 09:00 IST is 03:30 UTC.
const ist = (date: string, time: string) => new Date(`${date}T${time}:00+05:30`);

describe("workedByDay", () => {
  const from = ist("2026-10-01", "00:00");
  const to = ist("2026-10-08", "00:00");

  it("adds up sessions on the same day", () => {
    const days = workedByDay(
      [
        { startedAt: ist("2026-10-05", "09:00"), endedAt: ist("2026-10-05", "13:00") },
        { startedAt: ist("2026-10-05", "14:00"), endedAt: ist("2026-10-05", "18:30") },
      ],
      from,
      to
    );
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ date: "2026-10-05", minutes: 8 * 60 + 30 });
    expect(days[0].firstOn).toEqual(ist("2026-10-05", "09:00"));
    expect(days[0].lastOff).toEqual(ist("2026-10-05", "18:30"));
  });

  it("splits a shift that runs past midnight IST across both days", () => {
    const days = workedByDay(
      [{ startedAt: ist("2026-10-05", "22:00"), endedAt: ist("2026-10-06", "01:00") }],
      from,
      to
    );
    expect(days.map((d) => [d.date, d.minutes])).toEqual([
      ["2026-10-05", 120],
      ["2026-10-06", 60],
    ]);
  });

  it("clips sessions to the requested range", () => {
    const days = workedByDay(
      [{ startedAt: ist("2026-09-30", "20:00"), endedAt: ist("2026-10-01", "02:00") }],
      from,
      to
    );
    expect(days).toEqual([expect.objectContaining({ date: "2026-10-01", minutes: 120 })]);
  });

  it("counts an open session up to now and leaves lastOff empty", () => {
    const now = ist("2026-10-07", "12:00");
    const days = workedByDay([{ startedAt: ist("2026-10-07", "09:15"), endedAt: null }], from, now, now);
    expect(days[0]).toMatchObject({ date: "2026-10-07", minutes: 165, lastOff: null });
  });

  it("still shows an open session as on duty when the range ends a moment before now", () => {
    // The browser sends `to` = its own now, which the server's now has already passed.
    const now = ist("2026-10-07", "12:00");
    const to = new Date(now.getTime() - 40);
    const days = workedByDay([{ startedAt: ist("2026-10-07", "09:00"), endedAt: null }], from, to, now);
    expect(days[0].lastOff).toBeNull();
  });
});

describe("normalizeEmployeeCode", () => {
  it.each([
    ["RLX001", "RLX001"],
    ["rlx1", "RLX001"],
    ["RLX-007", "RLX007"],
    [" 12 ", "RLX012"],
    ["RLX1234", "RLX1234"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeEmployeeCode(input)).toBe(expected);
  });

  it("rejects things that are not codes", () => {
    expect(normalizeEmployeeCode("ABC001")).toBeNull();
    expect(normalizeEmployeeCode("")).toBeNull();
  });
});

describe("duty sessions and attendance", () => {
  let f: Fixtures;
  let admin: string;
  let empA: string;
  beforeEach(async () => {
    await resetDb();
    f = await seedFixtures();
    admin = (await login("9999999999")).accessToken;
    empA = (await login("9000000001")).accessToken;
    ensureSocket();
  });
  afterAll(() => prisma.$disconnect());

  const duty = (onDuty: boolean) =>
    api().post("/api/tracking/duty").set(bearer(empA)).send({ onDuty, lat: 13.05, lng: 80.25 });

  it("going on duty opens one session, even when tapped twice; going off closes it", async () => {
    await duty(true);
    await duty(true);
    let sessions = await prisma.dutySession.findMany({ where: { userId: f.empA.id } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0].endedAt).toBeNull();

    await duty(false);
    sessions = await prisma.dutySession.findMany({ where: { userId: f.empA.id } });
    expect(sessions[0].endedAt).not.toBeNull();
    expect(sessions[0].endReason).toBe("manual");
  });

  it("the silence sweep ends the session at the last ping, not at sweep time", async () => {
    await duty(true);
    const lastPing = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await prisma.$executeRaw`UPDATE "EmployeeLocation" SET "updatedAt" = ${lastPing} WHERE "userId" = ${f.empA.id}`;
    await prisma.dutySession.updateMany({
      where: { userId: f.empA.id },
      data: { startedAt: new Date(lastPing.getTime() - 60 * 60 * 1000) },
    });

    await sweepStaleDuty(120);

    const [session] = await prisma.dutySession.findMany({ where: { userId: f.empA.id } });
    expect(session.endReason).toBe("timeout");
    expect(session.endedAt!.getTime()).toBe(lastPing.getTime());
  });

  it("disabling an employee takes them off duty and closes their session", async () => {
    await duty(true);
    const res = await api().patch(`/api/employees/${f.empA.id}`).set(bearer(admin)).send({ active: false });
    expect(res.status).toBe(200);
    const location = await prisma.employeeLocation.findUniqueOrThrow({ where: { userId: f.empA.id } });
    expect(location.onDuty).toBe(false);
    const [session] = await prisma.dutySession.findMany({ where: { userId: f.empA.id } });
    expect(session.endReason).toBe("deactivated");
  });

  it("attendance by employee code reports hours per day and the total", async () => {
    const now = new Date();
    await prisma.dutySession.createMany({
      data: [
        {
          userId: f.empA.id,
          startedAt: new Date(now.getTime() - 5 * 60 * 60 * 1000),
          endedAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
          endReason: "manual",
        },
        { userId: f.empA.id, startedAt: new Date(now.getTime() - 30 * 60 * 1000) },
      ],
    });

    const res = await api()
      .get("/api/employees/code/rlx1/attendance")
      .query({ from: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(), to: now.toISOString() })
      .set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.employee).toMatchObject({ employeeCode: "RLX001", name: "Emp A" });
    expect(res.body.sessions).toHaveLength(2);
    // 2h closed + ~30 min open; allow a minute either way for test timing.
    expect(res.body.totalMinutes).toBeGreaterThanOrEqual(149);
    expect(res.body.totalMinutes).toBeLessThanOrEqual(151);
    expect(res.body).not.toHaveProperty("employee.passwordHash");
  });

  it("an unknown or malformed code is a clear error", async () => {
    const missing = await api().get("/api/employees/code/RLX999/attendance").set(bearer(admin));
    expect(missing.status).toBe(404);
    expect(missing.body.error).toContain("RLX999");
    const bad = await api().get("/api/employees/code/hello/attendance").set(bearer(admin));
    expect(bad.status).toBe(400);
  });

  it("sales employees cannot look up attendance", async () => {
    const res = await api().get("/api/employees/code/RLX001/attendance").set(bearer(empA));
    expect(res.status).toBe(403);
  });

  it("a new employee gets the next free code", async () => {
    const res = await api()
      .post("/api/employees")
      .set(bearer(admin))
      .send({ name: "New Rep", phone: "9000000003", password: "abcd", districtId: f.chennai.id });
    expect(res.status).toBe(201);
    expect(res.body.employee.employeeCode).toBe("RLX003");
  });

  it("the employee list shows codes and today's minutes", async () => {
    await prisma.dutySession.create({
      data: { userId: f.empA.id, startedAt: new Date(Date.now() - 45 * 60 * 1000) },
    });
    const res = await api().get("/api/employees").set(bearer(admin));
    const a = res.body.employees.find((e: { id: string }) => e.id === f.empA.id);
    expect(a.employeeCode).toBe("RLX001");
    expect(a.minutesToday).toBeGreaterThanOrEqual(44);
  });
});

describe("order and report logic", () => {
  let f: Fixtures;
  let admin: string;
  let empA: string;
  beforeEach(async () => {
    await resetDb();
    f = await seedFixtures();
    await putOnDuty(f.empA.id);
    admin = (await login("9999999999")).accessToken;
    empA = (await login("9000000001")).accessToken;
  });

  it("an order with an unpriced size is refused with the product named", async () => {
    await prisma.productVariant.update({ where: { id: f.v4L.id }, data: { price: 0 } });
    const res = await api()
      .post("/api/orders")
      .set(bearer(empA))
      .send({ customerName: "Ravi", items: [{ variantId: f.v4L.id, quantity: 1 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Royale Premium Emulsion (4L)");
  });

  it("cancelled orders don't count towards sales", async () => {
    const place = (qty: number) =>
      api()
        .post("/api/orders")
        .set(bearer(empA))
        .send({ customerName: "Ravi", items: [{ variantId: f.v1L.id, quantity: qty }] });
    await place(1); // ₹500
    const cancelled = (await place(10)).body.order; // ₹5,000
    await api().patch(`/api/orders/${cancelled.id}/status`).set(bearer(admin)).send({ status: "cancelled" });

    const res = await api().get("/api/reports/summary").set(bearer(admin));
    expect(res.body.totalSales).toBe(500);
    expect(res.body.totalOrders).toBe(1);
    expect(res.body.employeeLeaderboard[0].totalSales).toBe(500);
    expect(res.body.topProducts[0].revenue).toBe(500);
    expect(res.body.orderStatusBreakdown).toContainEqual({ status: "cancelled", count: 1 });
  });
});

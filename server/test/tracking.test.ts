import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { api, bearer, ensureSocket, login, resetDb, seedFixtures, type Fixtures } from "./helpers";
import { sweepStaleDuty } from "../src/lib/dutySweep";

let f: Fixtures;
let emp: string;
let admin: string;
beforeAll(ensureSocket);
beforeEach(async () => {
  await resetDb();
  f = await seedFixtures();
  emp = (await login("9000000001")).accessToken;
  admin = (await login("9999999999")).accessToken;
});
afterAll(() => prisma.$disconnect());

const goOnDuty = () =>
  api().post("/api/tracking/duty").set(bearer(emp)).send({ onDuty: true, employeeCode: "RLX-CHN-001", lat: 13.08, lng: 80.27 });
const goOffDuty = () => api().post("/api/tracking/duty").set(bearer(emp)).send({ onDuty: false, employeeCode: "RLX-CHN-001" });
const sendLocation = (lat: number, lng: number) =>
  api().patch("/api/tracking/location").set(bearer(emp)).send({ lat, lng, accuracy: 10 });

describe("duty and live tracking", () => {
  it("FR-TRK-04 an on-duty update moves the latest position and appends history", async () => {
    await goOnDuty();
    const res = await sendLocation(13.1, 80.3);
    expect(res.status).toBe(200);

    const live = await api().get("/api/tracking/live").set(bearer(admin));
    expect(live.body.locations).toHaveLength(1);
    expect(live.body.locations[0]).toMatchObject({ userId: f.empA.id, lat: 13.1, lng: 80.3, onDuty: true });
    expect(await prisma.locationHistory.count({ where: { userId: f.empA.id } })).toBe(1);
  });

  it("TC-10 a location update after going off duty is rejected and does not put them back on duty", async () => {
    await goOnDuty();
    await goOffDuty();

    const late = await sendLocation(13.2, 80.4);
    expect(late.status).toBe(409);

    const live = await api().get("/api/tracking/live").set(bearer(admin));
    expect(live.body.locations).toEqual([]);
    const row = await prisma.employeeLocation.findUniqueOrThrow({ where: { userId: f.empA.id } });
    expect(row.onDuty).toBe(false);
    expect(await prisma.locationHistory.count()).toBe(0);
  });

  it("TC-10 a location update before ever going on duty is rejected", async () => {
    expect((await sendLocation(13.2, 80.4)).status).toBe(409);
    expect(await prisma.employeeLocation.count()).toBe(0);
  });

  it("rejects out-of-range coordinates", async () => {
    await goOnDuty();
    expect((await sendLocation(123, 80)).status).toBe(400);
  });
});

describe("stale duty sweep", () => {
  const ageRow = (minutes: number) =>
    prisma.$executeRaw`UPDATE "EmployeeLocation" SET "updatedAt" = now() - make_interval(mins => ${minutes}::int)`;

  it("switches an employee silent past the timeout off duty without touching their last-seen time", async () => {
    await goOnDuty();
    await ageRow(180);
    const before = await prisma.employeeLocation.findUniqueOrThrow({ where: { userId: f.empA.id } });

    expect(await sweepStaleDuty(120)).toBe(1);

    const after = await prisma.employeeLocation.findUniqueOrThrow({ where: { userId: f.empA.id } });
    expect(after.onDuty).toBe(false);
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    const live = await api().get("/api/tracking/live").set(bearer(admin));
    expect(live.body.locations).toEqual([]);
  });

  it("leaves an employee who reported recently on duty", async () => {
    await goOnDuty();
    await ageRow(30);
    expect(await sweepStaleDuty(120)).toBe(0);
    const row = await prisma.employeeLocation.findUniqueOrThrow({ where: { userId: f.empA.id } });
    expect(row.onDuty).toBe(true);
  });
});

describe("duty confirmation", () => {
  it("needs the employee's own code, typed in any case or spacing", async () => {
    const send = (body: Record<string, unknown>) => api().post("/api/tracking/duty").set(bearer(emp)).send(body);
    expect((await send({ onDuty: true })).status).toBe(400);
    const wrong = await send({ onDuty: true, employeeCode: "RLX-MDU-001" });
    expect(wrong.status).toBe(403);
    expect(await prisma.employeeLocation.findUnique({ where: { userId: f.empA.id } })).toBeNull();

    expect((await send({ onDuty: true, employeeCode: "rlx chn 001" })).status).toBe(200);
    expect((await send({ onDuty: false, employeeCode: "RLX-MDU-001" })).status).toBe(403);
    const loc = await prisma.employeeLocation.findUniqueOrThrow({ where: { userId: f.empA.id } });
    expect(loc.onDuty).toBe(true);
  });
});

describe("time in one place", () => {
  const stay = () => prisma.employeeLocation.findUniqueOrThrow({ where: { userId: f.empA.id } });

  it("keeps its start while the employee stays within GPS drift, and restarts when they move on", async () => {
    await goOnDuty();
    const started = (await stay()).stationarySince!;
    expect(started).toBeInstanceOf(Date);

    // 50 m away: still the same spot.
    await sendLocation(13.0804, 80.27);
    expect((await stay()).stationarySince).toEqual(started);

    // 2 km away: a new stay begins there.
    await new Promise((r) => setTimeout(r, 5));
    await sendLocation(13.1, 80.27);
    const moved = await stay();
    expect(moved.stationarySince!.getTime()).toBeGreaterThan(started.getTime());
    expect(moved.anchorLat).toBe(13.1);

    await goOffDuty();
    expect((await stay()).stationarySince).toBeNull();
  });
});

describe("an employee's day", () => {
  it("draws the route, finds stops of 15 minutes or more, and lists the day's orders", async () => {
    const day = new Date("2026-10-15T04:00:00Z"); // 09:30 IST
    const at = (min: number) => new Date(day.getTime() + min * 60_000);
    await prisma.locationHistory.createMany({
      data: [
        { userId: f.empA.id, lat: 13.0, lng: 80.2, recordedAt: at(0) },
        { userId: f.empA.id, lat: 13.0003, lng: 80.2, recordedAt: at(10) },
        { userId: f.empA.id, lat: 13.0002, lng: 80.2001, recordedAt: at(40) }, // 40 min stop
        { userId: f.empA.id, lat: 13.05, lng: 80.2, recordedAt: at(55) },
        { userId: f.empA.id, lat: 13.1, lng: 80.2, recordedAt: at(60) },
        // The next IST day: not part of this one.
        { userId: f.empA.id, lat: 13.1, lng: 80.2, recordedAt: new Date("2026-10-15T19:00:00Z") },
      ],
    });
    const res = await api().get("/api/employees/code/rlx-chn-001/route?date=2026-10-15").set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.points).toHaveLength(5);
    expect(res.body.stops).toHaveLength(1);
    expect(res.body.stops[0].minutes).toBe(40);
    expect(res.body.distanceKm).toBeGreaterThan(10);

    expect((await api().get("/api/employees/code/rlx-chn-001/route?date=15-10-2026").set(bearer(admin))).status).toBe(400);
    expect((await api().get("/api/employees/code/rlx-chn-001/route?date=2026-10-15").set(bearer(emp))).status).toBe(403);
  });
});

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
  api().post("/api/tracking/duty").set(bearer(emp)).send({ onDuty: true, lat: 13.08, lng: 80.27 });
const goOffDuty = () => api().post("/api/tracking/duty").set(bearer(emp)).send({ onDuty: false });
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

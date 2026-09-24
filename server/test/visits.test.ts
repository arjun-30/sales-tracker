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

const checkIn = (token: string, shopName = "Sri Murugan Paints") =>
  api()
    .post("/api/visits/checkin")
    .set(bearer(token))
    .send({ shopName, lat: 13.05, lng: 80.25, notes: "first call" });

describe("shop visits", () => {
  it("TC-13 check-in records GPS and the employee's district", async () => {
    const res = await checkIn(empA);
    expect(res.status).toBe(201);
    expect(res.body.visit).toMatchObject({
      employeeId: f.empA.id,
      districtId: f.chennai.id,
      shopName: "Sri Murugan Paints",
      checkInLat: 13.05,
      checkInLng: 80.25,
      checkOutAt: null,
    });
  });

  it("TC-14 a second check-in while a visit is open returns 409", async () => {
    await checkIn(empA);
    const res = await checkIn(empA, "Another shop");
    expect(res.status).toBe(409);
  });

  it("TC-15 checking out another employee's visit returns 404", async () => {
    const visit = (await checkIn(empA)).body.visit;
    const res = await api()
      .post(`/api/visits/${visit.id}/checkout`)
      .set(bearer(empB))
      .send({ lat: 13, lng: 80 });
    expect(res.status).toBe(404);
  });

  it("FR-VIS-03 the owner checks out once; a second checkout returns 409", async () => {
    const visit = (await checkIn(empA)).body.visit;
    const checkout = () =>
      api().post(`/api/visits/${visit.id}/checkout`).set(bearer(empA)).send({ lat: 13.06, lng: 80.26 });
    const out = await checkout();
    expect(out.status).toBe(200);
    expect(out.body.visit.checkOutAt).not.toBeNull();
    expect((await checkout()).status).toBe(409);
  });
});

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { api, bearer, login, resetDb, seedFixtures, type Fixtures } from "./helpers";

let f: Fixtures;
let admin: string;
beforeEach(async () => {
  await resetDb();
  f = await seedFixtures();
  admin = (await login("9999999999")).accessToken;
});
afterAll(() => prisma.$disconnect());

describe("products and employees", () => {
  it("FR-PRD-02 short codes are stored in upper case", async () => {
    const res = await api()
      .post("/api/products")
      .set(bearer(admin))
      .send({ name: "Weather Coat", shortCode: " wc ", category: "Exterior" });
    expect(res.status).toBe(201);
    expect(res.body.product.shortCode).toBe("WC");
  });

  it("TC-21 a duplicate short code returns a clear 409, not a 500", async () => {
    const res = await api()
      .post("/api/products")
      .set(bearer(admin))
      .send({ name: "Copy", shortCode: "rpe", category: "Interior" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/already exists/i);
  });

  it("FR-PRD-04 a duplicate size label within a product returns 409", async () => {
    const res = await api()
      .post(`/api/products/${f.product.id}/variants`)
      .set(bearer(admin))
      .send({ sizeLabel: "1L", unit: "L", price: 10 });
    expect(res.status).toBe(409);
  });

  it("TC-22 creating an employee with an existing phone returns 409", async () => {
    const res = await api()
      .post("/api/employees")
      .set(bearer(admin))
      .send({ name: "Dup", phone: "9000000001", password: "abcd", districtId: f.chennai.id });
    expect(res.status).toBe(409);
  });

  it("FR-EMP-03 admin resets an employee's password; only the new one works", async () => {
    const res = await api()
      .post(`/api/employees/${f.empA.id}/password`)
      .set(bearer(admin))
      .send({ password: "fresh-pass" });
    expect(res.status).toBe(204);
    await expect(login("9000000001", "fresh-pass")).resolves.toBeDefined();
    const old = await api().post("/api/auth/login").send({ phone: "9000000001", password: "secret123" });
    expect(old.status).toBe(401);
  });

  it("FR-EMP-03 rejects short passwords, admin accounts and employee tokens", async () => {
    const short = await api().post(`/api/employees/${f.empA.id}/password`).set(bearer(admin)).send({ password: "abc" });
    expect(short.status).toBe(400);
    const onAdmin = await api().post(`/api/employees/${f.admin.id}/password`).set(bearer(admin)).send({ password: "abcd" });
    expect(onAdmin.status).toBe(404);
    const emp = (await login("9000000001")).accessToken;
    const byEmp = await api().post(`/api/employees/${f.empB.id}/password`).set(bearer(emp)).send({ password: "abcd" });
    expect(byEmp.status).toBe(403);
  });

  it("updating an employee never returns the password hash", async () => {
    const res = await api().patch(`/api/employees/${f.empA.id}`).set(bearer(admin)).send({ name: "Renamed" });
    expect(res.status).toBe(200);
    expect(res.body.employee.name).toBe("Renamed");
    expect(res.body.employee.passwordHash).toBeUndefined();
  });

  it("FR-EMP-01 creates an employee who can then log in", async () => {
    const res = await api()
      .post("/api/employees")
      .set(bearer(admin))
      .send({ name: "New Rep", phone: "9000000009", password: "abcd", districtId: f.madurai.id });
    expect(res.status).toBe(201);
    await expect(login("9000000009", "abcd")).resolves.toBeDefined();
  });
});

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

  it("FR-EMP-01 creates an employee who can then log in", async () => {
    const res = await api()
      .post("/api/employees")
      .set(bearer(admin))
      .send({ name: "New Rep", phone: "9000000009", password: "abcd", districtId: f.madurai.id });
    expect(res.status).toBe(201);
    await expect(login("9000000009", "abcd")).resolves.toBeDefined();
  });
});

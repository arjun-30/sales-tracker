import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { api, bearer, login, resetDb, seedFixtures } from "./helpers";

let admin: string;
beforeEach(async () => {
  await resetDb();
  await seedFixtures();
  admin = (await login("9999999999")).accessToken;
});
afterAll(() => prisma.$disconnect());

describe("error handling (NFR-REL-01)", () => {
  it("TC-25 PATCH on a non-existent product returns JSON 404 and the server keeps serving", async () => {
    const res = await api().patch("/api/products/does-not-exist").set(bearer(admin)).send({ name: "x" });
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "Not found" });
    expect((await api().get("/health")).status).toBe(200);
  });

  it("TC-25 a report with from=abc returns JSON 400 and the server keeps serving", async () => {
    const res = await api().get("/api/reports/summary?from=abc").set(bearer(admin));
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
    expect((await api().get("/health")).status).toBe(200);
  });

  it("returns 400 for a malformed JSON body", async () => {
    const res = await api()
      .post("/api/products")
      .set(bearer(admin))
      .set("Content-Type", "application/json")
      .send("{not json");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "Malformed JSON body" });
  });
});

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { api, PASSWORD, resetDb, seedFixtures } from "./helpers";

// The rest of the suite runs with DISABLE_RATE_LIMIT=1; this file turns it back on.
beforeAll(() => {
  process.env.DISABLE_RATE_LIMIT = "0";
});
afterAll(async () => {
  process.env.DISABLE_RATE_LIMIT = "1";
  await prisma.$disconnect();
});
beforeEach(async () => {
  await resetDb();
  await seedFixtures();
});

const attempt = (phone: string, password: string) =>
  api().post("/api/auth/login").send({ phone, password });

describe("login rate limiting (NFR-SEC-05)", () => {
  it("blocks a phone number after 5 failed attempts, even with the right password", async () => {
    for (let i = 0; i < 5; i++) {
      expect((await attempt("9000000001", "wrong")).status).toBe(401);
    }
    const blocked = await attempt("9000000001", PASSWORD);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toMatch(/too many login attempts/i);

    // Other accounts are unaffected.
    expect((await attempt("9000000002", PASSWORD)).status).toBe(200);
  });

  it("does not count successful logins against the phone limit", async () => {
    for (let i = 0; i < 8; i++) {
      expect((await attempt("9999999999", PASSWORD)).status).toBe(200);
    }
  });
});

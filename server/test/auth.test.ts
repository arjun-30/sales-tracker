import jwt from "jsonwebtoken";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db";
import { api, bearer, login, PASSWORD, resetDb, seedFixtures, type Fixtures } from "./helpers";

let f: Fixtures;
beforeEach(async () => {
  await resetDb();
  f = await seedFixtures();
});
afterAll(() => prisma.$disconnect());

describe("auth", () => {
  it("TC-01 logs in with phone and password and returns both tokens", async () => {
    const res = await api().post("/api/auth/login").send({ phone: "9999999999", password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ id: f.admin.id, role: "admin" });
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("TC-02 wrong password returns 401 Invalid credentials", async () => {
    const res = await api().post("/api/auth/login").send({ phone: "9999999999", password: "wrong" });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
  });

  it("TC-02 unknown phone returns the same message as a wrong password", async () => {
    const res = await api().post("/api/auth/login").send({ phone: "1234567890", password: PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "Invalid credentials" });
  });

  it("TC-03 rejects an expired access token, and refresh issues one that works", async () => {
    const { refreshToken } = await login("9000000001");
    const expired = jwt.sign(
      { sub: f.empA.id, role: "sales_employee", name: "Emp A" },
      process.env.JWT_ACCESS_SECRET!,
      { expiresIn: -10 }
    );
    const denied = await api().get("/api/auth/me").set(bearer(expired));
    expect(denied.status).toBe(401);

    const refreshed = await api().post("/api/auth/refresh").send({ refreshToken });
    expect(refreshed.status).toBe(200);
    const me = await api().get("/api/auth/me").set(bearer(refreshed.body.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.user.id).toBe(f.empA.id);
  });

  it("TC-04 a deactivated employee can neither log in nor refresh", async () => {
    const { refreshToken } = await login("9000000001");
    await prisma.user.update({ where: { id: f.empA.id }, data: { active: false } });

    const loginRes = await api().post("/api/auth/login").send({ phone: "9000000001", password: PASSWORD });
    expect(loginRes.status).toBe(401);
    const refreshRes = await api().post("/api/auth/refresh").send({ refreshToken });
    expect(refreshRes.status).toBe(401);
  });

  it("NFR-SEC-01 protected routes need a token", async () => {
    expect((await api().get("/api/orders")).status).toBe(401);
    expect((await api().get("/health")).status).toBe(200);
  });
});

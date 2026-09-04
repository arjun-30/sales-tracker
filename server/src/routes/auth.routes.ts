import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../db";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { requireAuth } from "../middleware/auth";

export const authRouter = Router();

const loginSchema = z.object({
  phone: z.string().min(4),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "phone and password are required" });
  }
  const { phone, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.active) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const accessToken = signAccessToken({ sub: user.id, role: user.role, name: user.name });
  const refreshToken = signRefreshToken({ sub: user.id });

  res.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      phone: user.phone,
      role: user.role,
      districtId: user.districtId,
    },
  });
});

const refreshSchema = z.object({ refreshToken: z.string() });

authRouter.post("/refresh", async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "refreshToken is required" });
  }
  try {
    const { sub } = verifyRefreshToken(parsed.data.refreshToken);
    const user = await prisma.user.findUnique({ where: { id: sub } });
    if (!user || !user.active) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }
    const accessToken = signAccessToken({ sub: user.id, role: user.role, name: user.name });
    res.json({ accessToken });
  } catch {
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { id: true, name: true, phone: true, role: true, districtId: true, district: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
});

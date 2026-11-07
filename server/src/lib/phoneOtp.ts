import { createHash, randomInt, timingSafeEqual } from "crypto";
import { prisma } from "../db";
import { config } from "../config";
import { HttpError } from "./scope";
import { sendSms, smsProvider } from "./messaging";

// The SMS code that proves a new shop's mobile number is the owner's: sent to
// the number, read out by the owner, typed in by the salesperson.

const CODE_TTL_MS = 10 * 60 * 1000;
export const RESEND_AFTER_MS = 30 * 1000;
const MAX_PER_PHONE_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

const hash = (id: string, code: string) => createHash("sha256").update(`${id}:${code}`).digest();

export async function sendShopCode(opts: { userId: string; employeeName: string; phone: string; shopName: string; plantId: string }) {
  const { userId, phone } = opts;
  const now = Date.now();
  const recent = await prisma.phoneOtp.findMany({
    where: { phone, createdAt: { gte: new Date(now - 60 * 60 * 1000) } },
    orderBy: { createdAt: "desc" },
    select: { userId: true, createdAt: true },
  });
  const mine = recent.find((r) => r.userId === userId);
  if (mine && now - mine.createdAt.getTime() < RESEND_AFTER_MS) {
    const wait = Math.ceil((RESEND_AFTER_MS - (now - mine.createdAt.getTime())) / 1000);
    throw new HttpError(429, `Wait ${wait} seconds before sending another code.`);
  }
  if (recent.length >= MAX_PER_PHONE_PER_HOUR) {
    throw new HttpError(429, "Too many codes sent to this number. Try again in an hour.");
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const otp = await prisma.phoneOtp.create({
    data: { phone, userId, codeHash: "", expiresAt: new Date(now + CODE_TTL_MS) },
  });
  await prisma.phoneOtp.update({ where: { id: otp.id }, data: { codeHash: hash(otp.id, code).toString("hex") } });

  const sent = await sendSms({
    kind: "store_otp",
    to: phone,
    plantId: opts.plantId,
    text: `${code} is your Roalux shop registration code. Share it with our salesperson ${opts.employeeName} only to add ${opts.shopName}. Valid for 10 minutes.`,
    vars: [code, opts.employeeName, opts.shopName],
  });
  if (!sent) {
    await prisma.phoneOtp.delete({ where: { id: otp.id } });
    throw new HttpError(502, "Couldn't send the SMS. Check the number and try again.");
  }
  // With no SMS provider set up (development, demos) the code comes back so
  // the app can show it. Never in production.
  return { devCode: smsProvider() === "log" && !config.isProduction ? code : undefined };
}

// Checks and uses up the latest code sent to this number for this salesperson.
export async function useShopCode(userId: string, phone: string, code: string) {
  const otp = await prisma.phoneOtp.findFirst({
    where: { phone, userId, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!otp || otp.expiresAt.getTime() < Date.now()) {
    throw new HttpError(400, "The code has expired. Send a new one.");
  }
  if (otp.attempts >= MAX_ATTEMPTS) {
    throw new HttpError(400, "Too many wrong codes. Send a new one.");
  }
  const given = hash(otp.id, code.trim());
  const expected = Buffer.from(otp.codeHash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    await prisma.phoneOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    throw new HttpError(400, "That code is wrong. Check the SMS with the owner.");
  }
  // Conditional, so the same code can't add two shops at once.
  const { count } = await prisma.phoneOtp.updateMany({
    where: { id: otp.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (count === 0) throw new HttpError(400, "That code was already used. Send a new one.");
}

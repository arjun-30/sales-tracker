import type { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const tooMany = { error: "Too many login attempts. Wait 15 minutes and try again." };

// The API test suite logs in hundreds of times from one address; it sets this
// flag, and the rate-limit test clears it to exercise the limiter.
const skip = () => process.env.DISABLE_RATE_LIMIT === "1";

// Guessing one account's password: 5 failed logins per phone number per
// 15 minutes, whatever IP they come from. Successful logins don't count.
export const loginPerPhoneLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 5,
  skipSuccessfulRequests: true,
  skip,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request) => `phone:${String(req.body?.phone ?? "").trim()}`,
  message: tooMany,
});

// Spraying many accounts from one place: 30 login requests per IP per
// 15 minutes. Generous enough for a shared office connection.
export const loginPerIpLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 30,
  skip,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request) => ipKeyGenerator(req.ip ?? ""),
  message: tooMany,
});

// Online GSTIN checks cost money per lookup (answers are kept, so a repeat is
// free): 60 lookups per user per 15 minutes is far more than typing needs.
export const gstinLookupLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 60,
  skip,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  keyGenerator: (req: Request) => `gstin:${req.user?.sub ?? ipKeyGenerator(req.ip ?? "")}`,
  message: { error: "Too many GSTIN checks. Wait a few minutes and try again." },
});

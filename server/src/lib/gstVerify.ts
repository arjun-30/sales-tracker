import { prisma } from "../db";
import { gstinProblem, normalizeGstin } from "./gstin";

// Online GSTIN check through Sandbox (sandbox.co.in), a GST Suvidha Provider:
// is the number registered, is it active, and whose is it. Every answer is
// kept in GstinCheck, so a shop's number is paid for once and re-checked only
// after GST_CHECK_DAYS.
//
// With GST_VERIFY_PROVIDER unset, or when Sandbox can't be reached, the
// offline layout + check-digit test in lib/gstin.ts is all that runs and the
// number is "unchecked": orders still go through.

export type GstinVerdict =
  // Wrong layout or check digit, not registered, or cancelled/suspended.
  | { result: "invalid"; gstin: string; problem: string; status?: string | null; legalName?: string | null }
  // Registered and usable on the GST portal.
  | {
      result: "verified";
      gstin: string;
      status: string;
      legalName: string | null;
      tradeName: string | null;
      address: string | null;
      state: string | null;
      checkedAt: Date;
    }
  // Layout is right but the portal was not asked (no provider, or it failed).
  | { result: "unchecked"; gstin: string; reason: string };

export const gstVerifyProvider = () => (process.env.GST_VERIFY_PROVIDER === "sandbox" ? "sandbox" : "off");

const DAY = 24 * 60 * 60 * 1000;
// A found number is trusted for this many days; "not found" for one day, in
// case the shop registered yesterday.
const cacheDays = () => Number(process.env.GST_CHECK_DAYS ?? 30);
const TIMEOUT_MS = 8000;

// Statuses the GST portal shows for a number a shop can still bill with.
const usable = (status: string) => /^(active|provisional)/i.test(status.trim());

// ---- Sandbox client ------------------------------------------------------

const baseUrl = () => (process.env.SANDBOX_API_URL ?? "https://api.sandbox.co.in").replace(/\/$/, "");

// The access token lasts 24 hours; it is renewed after 23.
let token: { value: string; expires: number } | null = null;

export function resetGstVerifyForTests() {
  token = null;
  inFlight.clear();
}

async function call(path: string, init: RequestInit): Promise<Response> {
  return fetch(`${baseUrl()}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

async function accessToken(fresh = false): Promise<string> {
  if (!fresh && token && token.expires > Date.now()) return token.value;
  const key = process.env.SANDBOX_API_KEY;
  const secret = process.env.SANDBOX_API_SECRET;
  if (!key || !secret) throw new Error("SANDBOX_API_KEY and SANDBOX_API_SECRET are not set");
  const res = await call("/authenticate", {
    method: "POST",
    headers: { "x-api-key": key, "x-api-secret": secret, "x-api-version": "1.0.0", "Content-Type": "application/json" },
  });
  const body = (await res.json().catch(() => null)) as { data?: { access_token?: string } } | null;
  const value = body?.data?.access_token;
  if (!res.ok || !value) throw new Error(`Sandbox sign-in failed (HTTP ${res.status})`);
  token = { value, expires: Date.now() + 23 * 60 * 60 * 1000 };
  return value;
}

interface SandboxAddress {
  bno?: string;
  flno?: string;
  bnm?: string;
  st?: string;
  loc?: string;
  locality?: string;
  dst?: string;
  stcd?: string;
  pncd?: string;
}
interface SandboxTaxpayer {
  lgnm?: string;
  tradeNam?: string;
  sts?: string;
  rgdt?: string;
  cxdt?: string;
  pradr?: { addr?: SandboxAddress };
}

function joinAddress(a?: SandboxAddress): string | null {
  if (!a) return null;
  const parts = [a.bno, a.flno, a.bnm, a.st, a.locality, a.loc, a.dst, a.stcd, a.pncd]
    .map((p) => (p ?? "").trim())
    .filter((p) => p && p.toUpperCase() !== "NA");
  return parts.length ? [...new Set(parts)].join(", ") : null;
}

type Lookup =
  | { found: true; taxpayer: SandboxTaxpayer }
  | { found: false };

async function searchGstin(gstin: string): Promise<Lookup> {
  const send = async (fresh: boolean) =>
    call("/gst/compliance/public/gstin/search", {
      method: "POST",
      headers: {
        "x-api-key": process.env.SANDBOX_API_KEY ?? "",
        authorization: await accessToken(fresh),
        "x-api-version": "1.0.0",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ gstin }),
    });
  let res = await send(false);
  // An expired or revoked token: sign in again once.
  if (res.status === 401 || res.status === 403) res = await send(true);

  const body = (await res.json().catch(() => null)) as {
    data?: { data?: SandboxTaxpayer; status_cd?: string; error?: { error_cd?: string; message?: string } };
    message?: string;
  } | null;
  // The portal rejects the number itself.
  if (res.status === 422) return { found: false };
  if (!res.ok || !body?.data) throw new Error(`Sandbox GSTIN search failed (HTTP ${res.status}): ${body?.message ?? "no body"}`);
  if (body.data.status_cd === "1" && body.data.data) return { found: true, taxpayer: body.data.data };
  // FO8000 "No records found".
  if (body.data.error?.error_cd === "FO8000" || body.data.status_cd === "0") return { found: false };
  throw new Error(`Sandbox GSTIN search: unexpected reply ${JSON.stringify(body.data).slice(0, 200)}`);
}

// ---- Verdicts ------------------------------------------------------------

type CheckRow = NonNullable<Awaited<ReturnType<typeof prisma.gstinCheck.findUnique>>>;

function verdictFrom(row: CheckRow): GstinVerdict {
  if (!row.found || !row.status) {
    return {
      result: "invalid",
      gstin: row.gstin,
      problem: "No business is registered with this GSTIN. Check the number with the shop.",
    };
  }
  if (!usable(row.status)) {
    const who = row.legalName ? ` (${row.legalName})` : "";
    return {
      result: "invalid",
      gstin: row.gstin,
      status: row.status,
      legalName: row.legalName,
      problem: `This GSTIN${who} is ${row.status.toLowerCase()} on the GST portal. Ask the shop for their current GSTIN.`,
    };
  }
  return {
    result: "verified",
    gstin: row.gstin,
    status: row.status,
    legalName: row.legalName,
    tradeName: row.tradeName,
    address: row.address,
    state: row.state,
    checkedAt: row.checkedAt,
  };
}

const fresh = (row: CheckRow) =>
  Date.now() - row.checkedAt.getTime() < (row.found ? cacheDays() : 1) * DAY;

// Two people typing the same number at once make one paid call.
const inFlight = new Map<string, Promise<GstinVerdict>>();

async function lookupAndStore(gstin: string): Promise<GstinVerdict> {
  try {
    const found = await searchGstin(gstin);
    const t = found.found ? found.taxpayer : null;
    const data = {
      found: found.found,
      status: t?.sts?.trim() || null,
      legalName: t?.lgnm?.trim() || null,
      tradeName: t?.tradeNam?.trim() || null,
      address: joinAddress(t?.pradr?.addr),
      state: t?.pradr?.addr?.stcd?.trim() || null,
      registeredOn: t?.rgdt?.trim() || null,
      cancelledOn: t?.cxdt?.trim() || null,
      checkedAt: new Date(),
    };
    const row = await prisma.gstinCheck.upsert({ where: { gstin }, create: { gstin, ...data }, update: data });
    return verdictFrom(row);
  } catch (err) {
    console.error(`[gstin check failed] ${gstin}: ${(err as Error).message}`);
    // An older answer is better than none while Sandbox is down.
    const stale = await prisma.gstinCheck.findUnique({ where: { gstin } });
    if (stale) return verdictFrom(stale);
    return { result: "unchecked", gstin, reason: "The GST portal could not be reached. The number was not checked online." };
  }
}

// The full check: layout and check digit first (free), then the GST portal.
export async function verifyGstin(input: string): Promise<GstinVerdict> {
  const gstin = normalizeGstin(input);
  const problem = gstinProblem(gstin);
  if (problem) return { result: "invalid", gstin, problem };
  if (gstVerifyProvider() === "off") {
    return { result: "unchecked", gstin, reason: "Online GSTIN check is not set up. Only the format was checked." };
  }
  const cached = await prisma.gstinCheck.findUnique({ where: { gstin } });
  if (cached && fresh(cached)) return verdictFrom(cached);

  const running = inFlight.get(gstin);
  if (running) return running;
  const job = lookupAndStore(gstin).finally(() => inFlight.delete(gstin));
  inFlight.set(gstin, job);
  return job;
}

// What is copied onto a shop or an order alongside its GSTIN. The name and
// status are null when the number was not checked online.
export function gstinSnapshot(v: GstinVerdict) {
  return v.result === "verified"
    ? { gstinName: v.legalName ?? v.tradeName, gstinStatus: v.status, gstinCheckedAt: v.checkedAt }
    : { gstinName: null, gstinStatus: null, gstinCheckedAt: null };
}

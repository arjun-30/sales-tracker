import { prisma } from "../db";
import { emitToAdmins } from "../socket";
import { closeDuty } from "./duty";

// A phone that dies, loses signal for good or has the app force-killed never
// sends "off duty", so its row would stay onDuty forever and keep showing up
// on the live map and in on-duty counts. Anyone silent for longer than this is
// switched off duty by the server.
export const DUTY_TIMEOUT_MINUTES = Number(process.env.DUTY_TIMEOUT_MINUTES ?? 120);

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

interface SweptRow {
  userId: string;
  lat: number;
  lng: number;
  updatedAt: Date;
  name: string;
  districtId: string | null;
  plantId: string | null;
}

export async function sweepStaleDuty(timeoutMinutes = DUTY_TIMEOUT_MINUTES): Promise<number> {
  // Raw SQL on purpose: Prisma's @updatedAt would stamp the row with "now",
  // which would wipe out the employee's real last-seen time.
  const rows = await prisma.$queryRaw<SweptRow[]>`
    UPDATE "EmployeeLocation" AS el
       SET "onDuty" = false
      FROM "User" AS u
     WHERE u.id = el."userId"
       AND el."onDuty" = true
       AND el."updatedAt" < now() - make_interval(mins => ${timeoutMinutes}::int)
    RETURNING el."userId", el.lat, el.lng, el."updatedAt", u.name, u."districtId", u."plantId"
  `;

  for (const row of rows) {
    // Hours stop at the last ping, not at the sweep: the silent stretch was
    // not time worked.
    await prisma.$transaction((tx) => closeDuty(tx, row.userId, "timeout", row.updatedAt));
    emitToAdmins(row.plantId, "employee:duty", {
      employeeId: row.userId,
      name: row.name,
      districtId: row.districtId,
      onDuty: false,
      lat: row.lat,
      lng: row.lng,
      updatedAt: row.updatedAt,
    });
  }
  if (rows.length > 0) {
    console.log(`[dutySweep] switched ${rows.length} silent employee(s) off duty`);
  }
  return rows.length;
}

// The working day ends at this hour, IST (21 = 9 pm). Anyone still on duty is
// switched off then, so a salesperson who forgets doesn't log a night shift.
export const dayEndHour = () => Number(process.env.DUTY_DAY_END_HOUR ?? 21);
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

// Today's day-end moment (e.g. 21:00 IST) as a real instant.
export function dayEndToday(now = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  ist.setUTCHours(dayEndHour(), 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS);
}

// True from the day-end hour until midnight IST.
export function pastDayEnd(now = new Date()): boolean {
  return now >= dayEndToday(now);
}

export async function sweepDayEnd(now = new Date()): Promise<number> {
  if (!pastDayEnd(now)) return 0;
  const endAt = dayEndToday(now);
  const rows = await prisma.$queryRaw<SweptRow[]>`
    UPDATE "EmployeeLocation" AS el
       SET "onDuty" = false
      FROM "User" AS u
     WHERE u.id = el."userId"
       AND el."onDuty" = true
    RETURNING el."userId", el.lat, el.lng, el."updatedAt", u.name, u."districtId", u."plantId"
  `;
  for (const row of rows) {
    // Hours stop at 9 pm, not at the sweep a few minutes later.
    await prisma.$transaction((tx) => closeDuty(tx, row.userId, "day_end", endAt));
    emitToAdmins(row.plantId, "employee:duty", {
      employeeId: row.userId,
      name: row.name,
      districtId: row.districtId,
      onDuty: false,
      lat: row.lat,
      lng: row.lng,
      updatedAt: row.updatedAt,
    });
  }
  if (rows.length > 0) console.log(`[dutySweep] day end: switched ${rows.length} employee(s) off duty`);
  return rows.length;
}

export function startDutySweep(): NodeJS.Timeout {
  const run = () =>
    sweepStaleDuty()
      .then(() => sweepDayEnd())
      .catch((err) => console.error("[dutySweep] failed", err));
  run();
  return setInterval(run, SWEEP_INTERVAL_MS);
}

// "9 pm", for messages.
export function dayEndLabel(): string {
  const h = dayEndHour() % 24;
  return `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;
}

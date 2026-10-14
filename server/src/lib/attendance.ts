// Hours-worked arithmetic over duty sessions. Days are Indian calendar days
// (IST, UTC+5:30), since that is when the field team's day starts and ends.

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export interface SessionSpan {
  startedAt: Date;
  endedAt: Date | null;
}

export interface WorkedDay {
  date: string; // YYYY-MM-DD in IST
  minutes: number;
  firstOn: Date;
  lastOff: Date | null; // null while the employee is still on duty that day
}

export function istDateKey(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// Midnight IST at the start of the day containing `d`.
export function istStartOfDay(d: Date): Date {
  const shifted = new Date(d.getTime() + IST_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - IST_OFFSET_MS);
}

function nextIstMidnight(d: Date): Date {
  return new Date(istStartOfDay(d).getTime() + 24 * 60 * MINUTE_MS);
}

// Splits every session at IST midnights and keeps only the part inside
// [from, to]. An open session runs until `now`.
export function workedByDay(sessions: SessionSpan[], from: Date, to: Date, now = new Date()): WorkedDay[] {
  const days = new Map<string, WorkedDay>();
  for (const s of sessions) {
    const sessionEnd = s.endedAt ?? now;
    const start = s.startedAt > from ? s.startedAt : from;
    const end = sessionEnd < to ? sessionEnd : to;
    let cursor = start;
    while (cursor < end) {
      const midnight = nextIstMidnight(cursor);
      const sliceEnd = midnight < end ? midnight : end;
      const key = istDateKey(cursor);
      // The last slice of a session that is still open (clipped to the range).
      const stillOn = s.endedAt === null && sliceEnd.getTime() === end.getTime();
      const day = days.get(key) ?? { date: key, minutes: 0, firstOn: cursor, lastOff: sliceEnd };
      day.minutes += (sliceEnd.getTime() - cursor.getTime()) / MINUTE_MS;
      if (cursor < day.firstOn) day.firstOn = cursor;
      if (stillOn) day.lastOff = null;
      else if (day.lastOff !== null && sliceEnd > day.lastOff) day.lastOff = sliceEnd;
      days.set(key, day);
      cursor = sliceEnd;
    }
  }
  return [...days.values()]
    .map((d) => ({ ...d, minutes: Math.round(d.minutes) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function totalMinutes(days: WorkedDay[]): number {
  return days.reduce((sum, d) => sum + d.minutes, 0);
}

// Employee codes carry the plant: RLX-CHN-001. Accepts "rlx-chn-1", "RLXCHN001"
// or "CHN 1" and returns "RLX-CHN-001".
export function normalizeEmployeeCode(input: string): string | null {
  const m = input
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .match(/^(?:RLX(?=[A-Z]{2,5}\d))?([A-Z]{2,5})(\d{1,6})$/);
  if (!m) return null;
  return employeeCode(m[1], Number(m[2]));
}

export function employeeCode(plantCode: string, n: number): string {
  return `RLX-${plantCode}-${String(n).padStart(3, "0")}`;
}

// Plant codes are 2–5 capital letters (CHN, MDU). RLX is the company prefix.
export const PLANT_CODE_PATTERN = /^[A-Z]{2,5}$/;

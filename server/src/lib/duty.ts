import type { DutyEndReason, Prisma } from "@prisma/client";
import { prisma } from "../db";

type Tx = Prisma.TransactionClient;

// Opens a duty session unless one is already open, so a repeated "on duty"
// tap (or a retried request) never double-counts hours.
export async function startDutySession(tx: Tx, userId: string, at = new Date()) {
  const open = await tx.dutySession.findFirst({ where: { userId, endedAt: null } });
  if (open) return open;
  return tx.dutySession.create({ data: { userId, startedAt: at } });
}

// Ends a shift: closes the open duty session and any shop visit left open, both
// at `at`. Visits are closed at the employee's last known position, if any.
export async function closeDuty(tx: Tx, userId: string, reason: DutyEndReason, at = new Date()) {
  await tx.dutySession.updateMany({
    where: { userId, endedAt: null },
    data: { endedAt: at, endReason: reason },
  });
  const location = await tx.employeeLocation.findUnique({ where: { userId } });
  await tx.visit.updateMany({
    where: { employeeId: userId, checkOutAt: null },
    data: {
      checkOutAt: at,
      checkOutLat: location?.lat ?? null,
      checkOutLng: location?.lng ?? null,
    },
  });
}

export async function endDutyNow(userId: string, reason: DutyEndReason) {
  return prisma.$transaction(async (tx) => {
    await tx.employeeLocation.updateMany({ where: { userId, onDuty: true }, data: { onDuty: false } });
    await closeDuty(tx, userId, reason);
    return tx.employeeLocation.findUnique({ where: { userId } });
  });
}

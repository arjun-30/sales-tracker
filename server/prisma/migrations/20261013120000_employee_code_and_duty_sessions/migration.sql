-- CreateEnum
CREATE TYPE "DutyEndReason" AS ENUM ('manual', 'timeout', 'deactivated');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "employeeCode" TEXT;

-- CreateTable
CREATE TABLE "DutySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" "DutyEndReason",

    CONSTRAINT "DutySession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DutySession_userId_startedAt_idx" ON "DutySession"("userId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeCode_key" ON "User"("employeeCode");

-- AddForeignKey
ALTER TABLE "DutySession" ADD CONSTRAINT "DutySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: existing sales employees get codes in the order they joined.
UPDATE "User" AS u
   SET "employeeCode" = 'RLX' || lpad(n.rn::text, 3, '0')
  FROM (
    SELECT id, row_number() OVER (ORDER BY "createdAt", id) AS rn
      FROM "User"
     WHERE role = 'sales_employee'
  ) AS n
 WHERE u.id = n.id;

-- Anyone on duty right now gets an open session starting now: when their
-- current shift really began was never recorded, so it can't be recovered.
INSERT INTO "DutySession" ("id", "userId", "startedAt")
SELECT 'mig_' || md5(random()::text || el."userId"), el."userId", CURRENT_TIMESTAMP
  FROM "EmployeeLocation" AS el
 WHERE el."onDuty" = true;

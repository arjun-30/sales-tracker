// Deletes LocationHistory rows older than LOCATION_RETENTION_DAYS (default 90).
// Run monthly (DEPLOY.md). The latest position per employee is kept in
// EmployeeLocation and is never touched.
import { PrismaClient } from "@prisma/client";

const days = Number(process.env.LOCATION_RETENTION_DAYS ?? 90);
if (!Number.isInteger(days) || days < 1) {
  throw new Error("LOCATION_RETENTION_DAYS must be a whole number of days, 1 or more");
}

const prisma = new PrismaClient();

async function main() {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const { count } = await prisma.locationHistory.deleteMany({ where: { recordedAt: { lt: cutoff } } });
  console.log(`Deleted ${count} location points recorded before ${cutoff.toISOString()} (${days}-day retention)`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

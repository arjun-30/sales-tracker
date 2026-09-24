import { execSync } from "child_process";

// Applies migrations to the test database once per run. Refuses to touch any
// database whose name doesn't end in _test, since every test truncates tables.
export default function setup() {
  const url =
    process.env.TEST_DATABASE_URL ??
    "postgresql://painttracker:painttracker@localhost:5436/painttracker_test?schema=public";
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith("_test")) {
    throw new Error(`Refusing to run tests against "${dbName}": database name must end in _test`);
  }
  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "inherit",
  });
}

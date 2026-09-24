import { defineConfig } from "vitest/config";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://painttracker:painttracker@localhost:5436/painttracker_test?schema=public";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/globalSetup.ts"],
    // Every file shares one database and truncates it, so files must not overlap.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 60000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_ACCESS_SECRET: "test-access-secret",
      JWT_REFRESH_SECRET: "test-refresh-secret",
      DISABLE_RATE_LIMIT: "1",
    },
  },
});

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000,
    globalSetup: ["tests/global-setup.ts"],
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://bbz:bbz@localhost:54329/bbz_test",
      SESSION_SECRET: "test-secret-test-secret-test-secret-123456",
      APP_URL: "http://localhost:3101",
      WAHA_URL: "http://127.0.0.1:3999",
      WAHA_API_KEY: "testkey",
      WAHA_SESSION: "default",
      DEFAULT_PASSWORD: "Zaneva2026",
      CRON_SECRET: "cron-test-secret",
      REMINDER_DELAY_MIN_MS: "0",
      REMINDER_DELAY_MAX_MS: "0",
    },
  },
});

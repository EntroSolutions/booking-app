import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
export const E2E_NOW = "2026-01-05T08:00:00.000Z";
export const E2E_SECRET = "e2e-secret-for-local-testing-only-1234567890";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    timezoneId: "UTC",
    locale: "en-US",
    actionTimeout: 10_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@127.0.0.1:5432/booking_test?schema=public",
      APP_URL: baseURL,
      AUTH_URL: baseURL,
      AUTH_SECRET: "e2e-auth-secret-for-local-testing-only-1234567890",
      COACH_EMAILS: "coach@e2e.test",
      E2E_TESTING: "1",
      E2E_SECRET,
      E2E_NOW,
      RATE_LIMIT_STORE: "memory",
      RATE_LIMIT_KEY_SECRET: "e2e-rate-limit-key-for-local-tests-only",
      BOOKING_LEAD_TIME_MINUTES: "0",
      BOOKING_CANCELLATION_CUTOFF_MINUTES: "0",
      EMAIL_DELIVERY: "local",
      EMAIL_JOB_SECRET: "e2e-email-job-secret-for-local-testing-only",
    },
  },
});

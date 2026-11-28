import { defineConfig, devices } from "@playwright/test";

/**
 * V2 e2e config — the v2 specs are NOT in playwright.config.ts testMatch
 * (they write PROD data and are never wired into CI). Run them on demand:
 *   npm run smoke:v2            # core flows only (e2e/v2-smoke.spec.ts)
 *   npx playwright test --config playwright.v2.config.ts   # all v2 specs
 *
 * Same BASE_URL convention as playwright.config.ts:
 *   local dev server (default) or any remote via BASE_URL.
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";
const isRemote = !!process.env.BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    ...devices["Desktop Chrome"],
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "v2",
      testMatch: /v2-.*\.spec\.ts/,
    },
  ],

  ...(isRemote
    ? {}
    : {
        webServer: {
          command: "npm run dev",
          url: "http://localhost:3001",
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
        },
      }),
});

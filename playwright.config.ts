import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for LIKED.
 *
 * Tests can run against:
 *   1. Local dev server (default): http://localhost:3001
 *   2. Any remote URL (Vercel preview/production): set BASE_URL env var
 *
 * Usage:
 *   # Local (auto-starts dev server):
 *   npx playwright test
 *
 *   # Vercel production:
 *   BASE_URL=https://liked-zeta.vercel.app npx playwright test
 *
 *   # Vercel preview:
 *   BASE_URL=https://liked-hmbcjj8kc-lolos-projects-dc7e07be.vercel.app npx playwright test
 *
 *   # With custom test user:
 *   BASE_URL=https://liked-zeta.vercel.app \
 *   TEST_EMAIL=test@liked.app \
 *   TEST_PASSWORD=YourPassword \
 *   npx playwright test
 *
 * Run:  npm run test:e2e
 * UI:   npm run test:e2e:ui
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
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    // Global setup: login once and save storage state
    {
      name: "setup",
      testMatch: /helpers\/setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Unauthenticated tests (no storage state)
    {
      name: "unauth",
      testMatch: [
        /api-unauthenticated\.spec\.ts/,
        /auth-login\.spec\.ts/,
        /auth-signup\.spec\.ts/,
        /auth-smoke\.spec\.ts/,
        /auth-create-node\.spec\.ts/,
        /extension-auth\.spec\.ts/,
        /extension-install\.spec\.ts/,
        /extension-api\.spec\.ts/,
        /youtube-api\.spec\.ts/,
        /youtube-intelligent-import\.spec\.ts/,
        /navigation-unauth\.spec\.ts/,
      ],
      use: { ...devices["Desktop Chrome"] },
    },
    // Authenticated tests (use saved storage state)
    {
      name: "authed",
      testMatch: [
        /feed-authenticated\.spec\.ts/,
        /navigation-auth\.spec\.ts/,
      ],
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/storageState.json",
      },
    },
  ],

  // Only auto-start the dev server for local runs.
  // When BASE_URL is set (remote/Vercel), skip webServer entirely.
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

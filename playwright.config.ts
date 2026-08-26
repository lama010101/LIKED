import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E configuration for LIKED.
 *
 * Tests run against the local dev server (Next.js) on port 3000.
 * Start the server automatically via `webServer` config below.
 *
 * Run:  npm run test:e2e
 * UI:   npm run test:e2e:ui
 */
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
    baseURL: "http://localhost:3001",
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

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

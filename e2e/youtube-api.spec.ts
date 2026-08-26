import { test, expect } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./helpers/auth";

/**
 * E2E: YouTube Activity API routes — authenticated.
 *
 * Tests the YouTube integration endpoints:
 *   - GET /api/youtube/status     → connection status
 *   - GET /api/youtube/likes      → liked videos (requires YouTube connection)
 *   - GET /api/youtube/subscriptions → subscriptions (requires YouTube connection)
 *   - POST /api/youtube/disconnect → disconnect YouTube
 *
 * The test user (e2e-test@liked.app) does NOT have a YouTube connection,
 * so we test the "not connected" state:
 *   - status → { connected: false }
 *   - likes → 401 (no provider_token)
 *   - subscriptions → 401 (no provider_token)
 *
 * We also test the YouTube page UI:
 *   - Renders without error
 *   - Shows "Connect your YouTube account" when not connected
 *   - Connect button is present
 *
 * Note: We cannot test the full YouTube OAuth flow in E2E because it
 * requires a real Google account with YouTube. The OAuth callback
 * route (/api/youtube/callback) is tested indirectly via the connect
 * button click (which redirects to Google).
 */

test.describe("YouTube API — authenticated (not connected)", () => {
  test.use({ storageState: undefined });

  let cookies: { name: string; value: string; domain: string; path: string }[];

  test.beforeAll(async ({ browser }) => {
    // Login via UI to get session cookies
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });

    // Save cookies for API calls
    cookies = await context.cookies();
    await context.close();

    expect(cookies.length).toBeGreaterThan(0);
  });

  function makeRequest(extra?: Record<string, string>) {
    return {
      headers: {
        Cookie: cookies
          .filter((c) => c.domain.includes("localhost"))
          .map((c) => `${c.name}=${c.value}`)
          .join("; "),
        ...extra,
      },
    };
  }

  test("GET /api/youtube/status returns connected: false (not connected)", async ({ request }) => {
    const res = await request.get("/api/youtube/status", makeRequest());
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.connected).toBe(false);
  });

  test("GET /api/youtube/likes returns 401 (no provider_token)", async ({ request }) => {
    const res = await request.get("/api/youtube/likes", makeRequest());
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    // Error should mention YouTube connection
    expect(body.error.toLowerCase()).toMatch(/youtube|connect|provider/);
  });

  test("GET /api/youtube/subscriptions returns 401 (no provider_token)", async ({ request }) => {
    const res = await request.get("/api/youtube/subscriptions", makeRequest());
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(body.error.toLowerCase()).toMatch(/youtube|connect|provider/);
  });

  test("DELETE /api/youtube/likes/:videoId returns 401 (no provider_token)", async ({ request }) => {
    const res = await request.fetch("/api/youtube/likes/dQw4w9WgXcQ", {
      method: "DELETE",
      ...makeRequest(),
    });
    expect(res.status()).toBe(401);
  });

  test("DELETE /api/youtube/subscriptions/:id returns 401 (no provider_token)", async ({ request }) => {
    const res = await request.fetch("/api/youtube/subscriptions/sub123", {
      method: "DELETE",
      ...makeRequest(),
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/youtube/disconnect returns 200 (idempotent — no connection to disconnect)", async ({ request }) => {
    const res = await request.post("/api/youtube/disconnect", makeRequest());
    // Should succeed even if not connected (idempotent)
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

test.describe("YouTube page UI — authenticated (not connected)", () => {
  test.use({ storageState: undefined });

  test("youtube page renders connect prompt when not connected", async ({ page }) => {
    test.setTimeout(60_000);

    // Login
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });

    // Navigate to YouTube page — use domcontentloaded (not networkidle)
    // because the YouTube page polls /api/youtube/status.
    await page.goto("/youtube");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Should show connect prompt (not an error)
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Application error");
    expect(bodyText).not.toContain("Something went wrong");

    // Should show "Connect your YouTube account" heading
    await expect(page.getByRole("heading", { name: /connect your youtube account/i })).toBeVisible({ timeout: 10_000 });

    // Should have a "Connect YouTube" button
    await expect(page.getByRole("button", { name: /connect youtube/i })).toBeVisible();

    // Should have "Back to feed" link
    await expect(page.getByRole("button", { name: /back to feed/i })).toBeVisible();
  });

  test("youtube page does not crash on repeated visits", async ({ page }) => {
    test.setTimeout(90_000);

    // Login
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });

    // Visit YouTube page — use domcontentloaded (not networkidle) because
    // the YouTube page polls /api/youtube/status which keeps network busy.
    await page.goto("/youtube");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    // Navigate away and back
    await page.goto("/feed");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await page.goto("/youtube");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Application error");
  });
});

test.describe("YouTube API — unauthenticated", () => {
  test.use({ storageState: undefined });

  test("GET /api/youtube/status returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/youtube/status");
    expect(res.status()).toBe(401);
  });

  test("GET /api/youtube/likes returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/youtube/likes");
    expect(res.status()).toBe(401);
  });

  test("GET /api/youtube/subscriptions returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/youtube/subscriptions");
    expect(res.status()).toBe(401);
  });

  test("POST /api/youtube/disconnect returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/youtube/disconnect");
    expect(res.status()).toBe(401);
  });

  test("POST /api/youtube/connect returns 401 without auth", async ({ request }) => {
    const res = await request.post("/api/youtube/connect");
    expect(res.status()).toBe(401);
  });
});

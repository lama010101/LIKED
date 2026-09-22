import { test, expect } from "@playwright/test";
import { injectSession } from "./helpers/auth";

/**
 * E2E: GET /api/youtube/search — auth + not-connected coverage.
 *
 * The test user (e2e-test@liked.app) does NOT have a YouTube connection,
 * so the route must reject with 401 + code "not_connected" — the UI uses
 * that code to render the "Connect YouTube" prompt in the Add Card sheet.
 * The full search path requires a real Google account and cannot run in E2E.
 */

test.describe("YouTube search API — unauthenticated", () => {
  test.use({ storageState: undefined });

  test("GET /api/youtube/search returns 401 without auth", async ({ request }) => {
    const res = await request.get("/api/youtube/search?q=test");
    expect(res.status()).toBe(401);
  });

  test("GET /api/youtube/search rejects short queries before auth check", async ({
    request,
  }) => {
    const res = await request.get("/api/youtube/search?q=a");
    expect(res.status()).toBe(400);
  });
});

test.describe("YouTube search API — authenticated (not connected)", () => {
  test.use({ storageState: undefined });

  let cookies: { name: string; value: string; domain: string; path: string }[];

  test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await injectSession(context, baseURL ?? "http://localhost:3001");
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });

    cookies = await context.cookies();
    await context.close();

    expect(cookies.length).toBeGreaterThan(0);
  });

  function makeRequest() {
    return {
      headers: {
        Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
      },
    };
  }

  test("GET /api/youtube/search returns 401 + not_connected code", async ({
    request,
  }) => {
    const res = await request.get("/api/youtube/search?q=test", makeRequest());
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("not_connected");
  });
});

import { test, expect } from "@playwright/test";

/**
 * E2E: Extension API routes return 401 when unauthenticated.
 *
 * These routes expect a Bearer token from the Chrome extension.
 * Without it, they must return 401 + {"code":"unauthenticated"}.
 */
test.describe("Extension API routes — unauthenticated", () => {
  test.use({ storageState: undefined });

  test("POST /api/import returns 401", async ({ request }) => {
    const res = await request.post("/api/import", {
      data: { url: "https://example.com" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("unauthenticated");
  });

  test("GET /api/extension/folders returns 401", async ({ request }) => {
    const res = await request.get("/api/extension/folders");
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("unauthenticated");
  });

  test("GET /api/extension/tags returns 401", async ({ request }) => {
    const res = await request.get("/api/extension/tags");
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("unauthenticated");
  });

  test("OPTIONS /api/import returns 204 (CORS preflight)", async ({ request }) => {
    const res = await request.fetch("/api/import", {
      method: "OPTIONS",
      headers: {
        Origin: "chrome-extension://abcdefghijklmnop",
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(res.status()).toBe(204);
  });

  test("POST /api/import with invalid URL returns 400 (not 401) when authed — but 401 without auth", async ({ request }) => {
    // Without auth, the 401 check fires first (before URL validation).
    const res = await request.post("/api/import", {
      data: { url: "not-a-url" },
    });
    expect(res.status()).toBe(401);
  });
});

import { test, expect } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./helpers/auth";

/**
 * E2E: Chrome Extension API routes — authenticated.
 *
 * These tests verify the full extension API flow:
 *   1. Login via UI → extract access_token from Supabase session cookies
 *   2. GET /api/extension/folders  → 200 + folder list
 *   3. GET /api/extension/tags     → 200 + tag list
 *   4. POST /api/import            → 200 + { success, nodeId, alreadyExists }
 *   5. POST /api/import (dup)      → 200 + alreadyExists: true
 *   6. POST /api/import (invalid)  → 400 + { code: "invalid" }
 *   7. OPTIONS (CORS preflight)    → 204
 *   8. POST /api/import (advanced) → 200 with folder + tags + title
 *
 * The extension authenticates via Bearer token (not cookies), so we
 * extract the access_token from the browser session after login and
 * use it in direct API calls.
 */

const EXTENSION_ORIGIN = "chrome-extension://abcdefghijklmnop";

test.describe("Extension API — authenticated", () => {
  test.use({ storageState: undefined });

  let accessToken: string;
  let testUrl: string;

  test.beforeAll(async ({ browser }) => {
    // Login via UI to get a valid session
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });

    // Extract access_token from the page's Supabase browser client.
    // The supabase-ssr cookie is base64-encoded JSON of the session.
    const cookies = await context.cookies();
    const authCookies = cookies.filter((c) => c.name.includes("auth-token"));

    // supabase-ssr may chunk the session across multiple cookies
    // (sb-<ref>-auth-token.0, .1, etc.) — reassemble them.
    const sorted = authCookies.sort((a, b) => a.name.localeCompare(b.name));
    let rawValue = "";
    for (const c of sorted) {
      rawValue += decodeURIComponent(c.value);
    }

    if (rawValue) {
      try {
        // supabase-ssr stores the session with a "base64-" prefix
        // followed by the base64-encoded JSON session.
        let jsonStr: string;
        if (rawValue.startsWith("base64-")) {
          jsonStr = Buffer.from(rawValue.slice(7), "base64").toString("utf-8");
        } else {
          jsonStr = rawValue;
        }
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed === "object") {
          const session = parsed as { access_token?: string };
          if (session.access_token) {
            accessToken = session.access_token;
          }
        }
      } catch {
        // Fall through to page evaluation
      }
    }

    // Fallback: use page.evaluate with the global supabase client
    if (!accessToken) {
      // The supabase-ssr client stores session in cookies (not localStorage).
      // We can access the session by calling the supabase client's
      // auth.getSession() through the page's runtime.
      accessToken = await page.evaluate(async () => {
        // Try to find the supabase client on the window object
        // The app creates a singleton in lib/supabase/client.ts
        // but it's not exposed on window. We'll try reading cookies
        // directly from the browser.
        const cookieStr = document.cookie;
        const cookies = cookieStr.split(";").map(c => c.trim());
        for (const cookie of cookies) {
          const [name, ...valueParts] = cookie.split("=");
          if (name.includes("auth-token")) {
            const value = decodeURIComponent(valueParts.join("="));
            try {
              const parsed = JSON.parse(value);
              if (parsed?.access_token) return parsed.access_token;
            } catch {
              try {
                const decoded = atob(value);
                const parsed = JSON.parse(decoded);
                if (parsed?.access_token) return parsed.access_token;
              } catch {
                // try next
              }
            }
          }
        }
        return "";
      });
    }

    await context.close();

    expect(accessToken).toBeTruthy();
    testUrl = `https://example.com/ext-e2e-${Date.now()}`;
  });

  test("GET /api/extension/folders returns folder list", async ({ request }) => {
    const res = await request.get("/api/extension/folders", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Origin: EXTENSION_ORIGIN,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    // Every user has at least an "Unsorted" folder
    if (body.length > 0) {
      expect(body[0]).toHaveProperty("id");
      expect(body[0]).toHaveProperty("name");
      expect(body[0]).toHaveProperty("colorHex");
    }
  });

  test("GET /api/extension/tags returns tag list", async ({ request }) => {
    const res = await request.get("/api/extension/tags", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Origin: EXTENSION_ORIGIN,
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("POST /api/import creates a new node", async ({ request }) => {
    const res = await request.post("/api/import", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Origin: EXTENSION_ORIGIN,
      },
      data: {
        url: testUrl,
        clientMetadata: {
          pageTitle: "E2E Extension Test",
          faviconUrl: "",
        },
      },
      timeout: 30_000,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.nodeId).toBeTruthy();
    expect(body.alreadyExists).toBe(false);
  });

  test("POST /api/import with duplicate URL returns alreadyExists", async ({ request }) => {
    const res = await request.post("/api/import", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Origin: EXTENSION_ORIGIN,
      },
      data: {
        url: testUrl,
        clientMetadata: {
          pageTitle: "E2E Extension Test Dup",
        },
      },
      timeout: 30_000,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.alreadyExists).toBe(true);
  });

  test("POST /api/import with invalid URL returns 400", async ({ request }) => {
    const res = await request.post("/api/import", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Origin: EXTENSION_ORIGIN,
      },
      data: { url: "not-a-url" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid");
  });

  test("POST /api/import with empty URL returns 400", async ({ request }) => {
    const res = await request.post("/api/import", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Origin: EXTENSION_ORIGIN,
      },
      data: { url: "" },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("invalid");
  });

  test("OPTIONS /api/import returns 204 (CORS preflight)", async ({ request }) => {
    const res = await request.fetch("/api/import", {
      method: "OPTIONS",
      headers: {
        Origin: EXTENSION_ORIGIN,
        "Access-Control-Request-Method": "POST",
      },
    });
    expect(res.status()).toBe(204);
    // CORS header should be reflected back
    const allowOrigin = res.headers()["access-control-allow-origin"];
    expect(allowOrigin).toBe(EXTENSION_ORIGIN);
  });

  test("OPTIONS /api/extension/folders returns 204 (CORS preflight)", async ({ request }) => {
    const res = await request.fetch("/api/extension/folders", {
      method: "OPTIONS",
      headers: {
        Origin: EXTENSION_ORIGIN,
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(res.status()).toBe(204);
  });

  test("OPTIONS /api/extension/tags returns 204 (CORS preflight)", async ({ request }) => {
    const res = await request.fetch("/api/extension/tags", {
      method: "OPTIONS",
      headers: {
        Origin: EXTENSION_ORIGIN,
        "Access-Control-Request-Method": "GET",
      },
    });
    expect(res.status()).toBe(204);
  });

  test("POST /api/import with advanced fields (folder, tags, title, note)", async ({ request }) => {
    // First get folder list
    const foldersRes = await request.get("/api/extension/folders", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Origin: EXTENSION_ORIGIN,
      },
    });
    const folders = await foldersRes.json();
    const folderId = folders.length > 0 ? folders[0].id : null;

    const advancedUrl = `https://example.com/ext-advanced-${Date.now()}`;
    const res = await request.post("/api/import", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Origin: EXTENSION_ORIGIN,
      },
      data: {
        url: advancedUrl,
        title: "My Advanced Title",
        description: "Test description from extension",
        note: "Personal note from extension",
        folderId,
        newTagLabels: ["e2e-test-tag-1", "e2e-test-tag-2"],
        clientMetadata: {
          pageTitle: "Advanced E2E Test",
          faviconUrl: "",
        },
      },
      timeout: 30_000,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.nodeId).toBeTruthy();
    expect(body.alreadyExists).toBe(false);
  });

  test("GET /api/extension/folders with invalid token returns 401", async ({ request }) => {
    const res = await request.get("/api/extension/folders", {
      headers: {
        Authorization: "Bearer invalid-token-xxx",
        Origin: EXTENSION_ORIGIN,
      },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("unauthenticated");
  });

  test("POST /api/import with invalid token returns 401", async ({ request }) => {
    const res = await request.post("/api/import", {
      headers: {
        Authorization: "Bearer invalid-token-xxx",
        "Content-Type": "application/json",
        Origin: EXTENSION_ORIGIN,
      },
      data: { url: "https://example.com" },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("unauthenticated");
  });
});

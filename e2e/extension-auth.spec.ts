import { test, expect } from "@playwright/test";

/**
 * E2E: Extension auth relay page (/extension/auth).
 *
 * Unauthenticated users should be redirected to /login?redirect=/extension/auth.
 */
test.describe("Extension auth relay page", () => {
  test.use({ storageState: undefined });

  test("redirects unauthenticated user to /login with redirect param", async ({ page }) => {
    await page.goto("/extension/auth");

    // Should redirect to /login with redirect=/extension/auth
    await expect(page).toHaveURL(/\/login/);
    await expect(page).toHaveURL(/redirect=%2Fextension%2Fauth/);
  });

  test("page loads without server error (200 or redirect)", async ({ page }) => {
    const response = await page.goto("/extension/auth");
    // Either 200 (page renders then JS redirects) or 307 (server redirect)
    expect(response?.status()).toBeLessThan(400);
  });
});

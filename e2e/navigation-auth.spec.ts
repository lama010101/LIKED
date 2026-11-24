import { test, expect } from "@playwright/test";

/**
 * TEST PLAN — Navigation: authenticated access
 *
 * As an authenticated user, I should be able to access all protected pages.
 */
test.use({ storageState: "e2e/.auth/storageState.json" });

test.describe("Navigation — authenticated access", () => {
  test("/feed and /trash are accessible after login", async ({ page }) => {
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    await page.goto("/trash");
    await expect(page).toHaveURL(/\/trash/);

    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);
  });

  test("legal pages reachable from Settings (/me) (P0-21)", async ({ page }) => {
    await page.goto("/me");
    await expect(page).toHaveURL(/\/me/);

    await page.locator('a[href="/privacy"]').click();
    await expect(page).toHaveURL(/\/privacy/);
    await expect(page.getByRole("heading", { name: /privacy/i }).first()).toBeVisible();

    await page.goto("/me");
    await page.locator('a[href="/terms"]').click();
    await expect(page).toHaveURL(/\/terms/);
    await expect(page.getByRole("heading", { name: /terms/i }).first()).toBeVisible();
  });
});

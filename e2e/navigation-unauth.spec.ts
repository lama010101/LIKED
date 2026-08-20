import { test, expect } from "@playwright/test";

/**
 * TEST PLAN — Navigation: unauthenticated access control
 *
 * As an unauthenticated user, I should be redirected to /login
 * from every protected page.
 */
test.describe("Navigation — unauthenticated redirects", () => {
  test.use({ storageState: undefined });

  test("/ redirects to /login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/feed redirects to /login", async ({ page }) => {
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/trash redirects to /login", async ({ page }) => {
    await page.goto("/trash");
    await expect(page).toHaveURL(/\/login/);
  });

  test("/youtube redirects to /login", async ({ page }) => {
    await page.goto("/youtube");
    // /youtube has a client-side auth guard that redirects to /login
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});

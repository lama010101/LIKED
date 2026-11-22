import { test, expect } from "@playwright/test";

/**
 * TEST PLAN — Navigation: unauthenticated access control
 *
 * As an unauthenticated user, I should be redirected to /login
 * from every protected page.
 */
test.describe("Navigation — unauthenticated redirects", () => {
  test.use({ storageState: undefined });

  test("/ shows the public landing page", async ({ page }) => {
    await page.goto("/");
    // `/` is now a public landing page (uncommitted landing-page work):
    // unauth users stay on `/` and see Sign in / Get started links.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /get started/i }).first()).toBeVisible();
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

  test("/social redirects to /login", async ({ page }) => {
    await page.goto("/social");
    await expect(page).toHaveURL(/\/login/);
  });

  test("legal pages reachable from landing footer (P0-21)", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /privacy policy/i }).click();
    await expect(page).toHaveURL(/\/privacy/);
    await expect(page.getByRole("heading", { name: /privacy/i }).first()).toBeVisible();
    // Third-party coverage required by plan §8.1 P0-21 (brand names are
    // identical in all four catalogs).
    for (const brand of ["Google", "YouTube", "TMDB", "JustWatch", "delete-account"]) {
      await expect(page.getByText(brand).first()).toBeVisible();
    }

    await page.goto("/");
    await page.getByRole("link", { name: /^terms$/i }).click();
    await expect(page).toHaveURL(/\/terms/);
    await expect(page.getByRole("heading", { name: /terms/i }).first()).toBeVisible();
  });
});

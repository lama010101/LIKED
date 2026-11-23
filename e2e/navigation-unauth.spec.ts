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
    // v2 landing (Recommendation Inbox): one h1, Log in + Get started links.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/stop losing/i);
    await expect(page.getByRole("link", { name: /log in/i }).first()).toBeVisible();
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
});

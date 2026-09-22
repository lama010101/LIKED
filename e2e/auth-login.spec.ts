import { test, expect } from "@playwright/test";

/**
 * TEST PLAN — Auth: Login flow (Google-only, PRD §41.2)
 *
 * As a returning user, I want to:
 * 1. See the login page with the Google sign-in button + signup link
 * 2. No email/password form exists (removed — big-bang OAuth replacement)
 * 3. Navigate to signup via the link
 */
test.describe("Auth — Login flow", () => {
  test.use({ storageState: undefined });

  test("renders Google-only login: wordmark + Google button + signup link, no email/password", async ({ page }) => {
    await page.goto("/login");

    await expect(page.locator("h1")).toContainText("liked");
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign up/i })).toBeVisible();

    // Email/password path removed entirely — assert the fields are gone.
    await expect(page.locator("#email")).toHaveCount(0);
    await expect(page.locator("#password")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^sign in$/i })).toHaveCount(0);
  });

  test("signup link navigates to /signup", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test("unauthenticated /feed visit redirects to /login", async ({ page }) => {
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 });
  });
});

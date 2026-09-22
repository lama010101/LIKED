import { test, expect } from "@playwright/test";

/**
 * TEST PLAN — Auth: Signup page (Google-only, PRD §41.2)
 *
 * As a new user, I want to:
 * 1. See the signup page with the Google OAuth option
 * 2. No email/password/display-name form (account creation is inside OAuth)
 * 3. See a link back to login
 */
test.describe("Auth — Signup page", () => {
  test.use({ storageState: undefined });

  test("renders Google-only signup: wordmark + Google button + login link, no email/password/name", async ({ page }) => {
    await page.goto("/signup");

    // Wordmark
    await expect(page.locator("h1")).toContainText("liked");

    // Google OAuth button
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();

    // Login link
    await expect(page.getByRole("link", { name: /log in/i })).toBeVisible();

    // Email/password/display-name path removed entirely.
    await expect(page.locator("#email")).toHaveCount(0);
    await expect(page.locator("#password")).toHaveCount(0);
    await expect(page.locator("#displayName")).toHaveCount(0);
  });

  test("login link navigates to /login", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("link", { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });
});

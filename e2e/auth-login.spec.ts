import { test, expect } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./helpers/auth";

/**
 * TEST PLAN — Auth: Login flow
 *
 * As a returning user, I want to:
 * 1. See the login form with email + password + Google + signup link
 * 2. Log in with valid credentials → redirected to /feed
 * 3. See error on invalid credentials
 * 4. Navigate to signup via the link
 */
test.describe("Auth — Login flow", () => {
  test.use({ storageState: undefined });

  test("renders login form with email + password + Google + signup link", async ({ page }) => {
    await page.goto("/login");

    await expect(page.locator("h1")).toContainText("liked");
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /sign up/i })).toBeVisible();
  });

  test("login with valid credentials redirects to /feed", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/login");

    await page.locator("#email").fill(TEST_EMAIL);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Should redirect to /feed (server action may take time)
    await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });
  });

  test("shows error on invalid credentials", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/login");

    await page.locator("#email").fill("wrong@test.com");
    await page.locator("#password").fill("wrongpassword");
    await page.getByRole("button", { name: /sign in/i }).click();

    await expect(page.locator("text=/invalid|error|incorrect|failed|disabled/i")).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("signup link navigates to /signup", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: /sign up/i }).click();
    await expect(page).toHaveURL(/\/signup/);
  });

  test("login button shows loading state", async ({ page }) => {
    await page.goto("/login");

    await page.locator("#email").fill(TEST_EMAIL);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Button should show "Signing in..." briefly
    await expect(page.getByRole("button", { name: /signing in/i })).toBeVisible({ timeout: 3_000 });
  });
});

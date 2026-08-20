import { test, expect } from "@playwright/test";
import { TEST_PASSWORD } from "./helpers/auth";

/**
 * TEST PLAN — Auth: Signup page
 *
 * As a new user, I want to:
 * 1. See the signup form with email, password, display name fields
 * 2. See the Google OAuth option
 * 3. See a link back to login
 */
test.describe("Auth — Signup page", () => {
  test.use({ storageState: undefined });

  test("renders signup form with email + password + display name + Google + login link", async ({ page }) => {
    await page.goto("/signup");

    // Wordmark
    await expect(page.locator("h1")).toContainText("liked");

    // Form fields
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.locator("#displayName")).toBeVisible();

    // Submit button
    await expect(page.getByRole("button", { name: /sign up/i })).toBeVisible();

    // Google OAuth button
    await expect(page.getByRole("button", { name: /continue with google/i })).toBeVisible();

    // Login link
    await expect(page.getByRole("link", { name: /log in/i })).toBeVisible();
  });

  test("login link navigates to /login", async ({ page }) => {
    await page.goto("/signup");
    await page.getByRole("link", { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test("shows error on duplicate signup", async ({ page }) => {
    await page.goto("/signup");

    await page.locator("#email").fill("e2e-test@liked.app");
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign up/i }).click();

    // Should show an error (user already exists)
    await expect(page.locator("text=/already|exists|error/i")).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/signup/);
  });
});

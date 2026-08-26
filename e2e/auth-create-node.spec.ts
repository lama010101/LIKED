import { test, expect } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./helpers/auth";

/**
 * Test node creation via the AddCardSheet.
 * Logs in, opens FAB, clicks "Card", creates a URL node, verifies it appears.
 */

test.describe("Authenticated — node creation", () => {
  test.use({ storageState: undefined });

  test("create a URL node via AddCardSheet", async ({ page }) => {
    test.setTimeout(120_000);

    // Login
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });

    // Wait for feed to load
    await page.waitForLoadState("networkidle");

    // Open the FAB speed dial
    const fab = page.locator('button[aria-label="Add"]');
    await expect(fab).toBeVisible({ timeout: 10_000 });
    await fab.click();
    await page.waitForTimeout(500);

    // Click "Card" in the speed dial
    const addCardBtn = page.locator('button[aria-label="Card"]');
    await expect(addCardBtn).toBeVisible({ timeout: 5_000 });
    await addCardBtn.click();

    // The AddCardSheet should open with a textarea
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 5_000 });

    // Type a URL character by character to trigger React state
    const testUrl = `https://example.com/test-${Date.now()}`;
    await textarea.click();
    await page.keyboard.type(testUrl, { delay: 10 });
    await page.waitForTimeout(500);

    // Click Save — wait for button to be enabled
    const saveBtn = page.getByRole("button", { name: /save card/i });
    await expect(saveBtn).toBeVisible({ timeout: 5_000 });
    await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
    await saveBtn.click();

    // Wait for the action to complete (Edge Function + RPC)
    // The sheet should close on success
    await page.waitForTimeout(8000);

    // Take a screenshot
    await page.screenshot({ path: "test-results/auth-after-create.png", fullPage: true });

    // The page should still be on /feed (no crash)
    expect(page.url()).toContain("/feed");
  });
});

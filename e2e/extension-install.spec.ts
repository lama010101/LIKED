import { test, expect } from "@playwright/test";

/**
 * E2E: Chrome Extension install page (/extension/install).
 *
 * This is a public static page — no auth required.
 */
test.describe("Extension install page", () => {
  test.use({ storageState: undefined });

  test("renders install instructions with 5 steps", async ({ page }) => {
    await page.goto("/extension/install");

    // Title
    await expect(page.getByRole("heading", { name: /install liked chrome extension/i })).toBeVisible();

    // Step 1: Download
    await expect(page.getByText(/download the extension/i)).toBeVisible();
    await expect(page.locator("code").filter({ hasText: "npm run build:extension" })).toBeVisible();

    // Step 2: chrome://extensions
    await expect(page.getByText(/open chrome extensions page/i)).toBeVisible();
    await expect(page.locator("code").filter({ hasText: "chrome://extensions" })).toBeVisible();

    // Step 3: Developer mode
    await expect(page.getByText(/enable developer mode/i)).toBeVisible();

    // Step 4: Load unpacked
    await expect(page.getByText("Load unpacked", { exact: true })).toBeVisible();
    await expect(page.locator("code").filter({ hasText: "extension/dist" })).toBeVisible();

    // Step 5: Sign in
    await expect(page.getByText("Sign in", { exact: true })).toBeVisible();
  });

  test("has link back to feed", async ({ page }) => {
    await page.goto("/extension/install");
    await expect(page.getByRole("link", { name: /back to feed/i })).toBeVisible();
  });

  test("has GitHub repo link", async ({ page }) => {
    await page.goto("/extension/install");
    const repoLink = page.getByRole("link", { name: /liked repo/i });
    await expect(repoLink).toBeVisible();
    await expect(repoLink).toHaveAttribute("href", "https://github.com/lama010101/LIKED");
  });

  test("copy repo URL button works", async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const page = await context.newPage();
    await page.goto("/extension/install");

    const copyBtn = page.getByRole("button", { name: /copy repo url/i });
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    // Button text changes to "✓ Copied"
    await expect(page.getByRole("button", { name: /copied/i })).toBeVisible({ timeout: 5_000 });

    // Verify clipboard content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe("https://github.com/lama010101/LIKED");

    await context.close();
  });
});

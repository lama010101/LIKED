import { test, expect } from "@playwright/test";

/**
 * E2E: Chrome Extension install page (/extension/install).
 *
 * This is a public static page — no auth required.
 * The page was redesigned to a simpler 3-step flow:
 *   1. Download ZIP (or Add to Chrome if web store URL is set)
 *   2. Unzip the file
 *   3. Load in Chrome (chrome://extensions → Developer mode → Load unpacked)
 *   4. Sign in
 */
test.describe("Extension install page", () => {
  test.use({ storageState: undefined });

  test("renders install instructions with title and steps", async ({ page }) => {
    await page.goto("/extension/install");

    // Title
    await expect(page.getByRole("heading", { name: /install liked chrome extension/i })).toBeVisible();

    // Download button (ZIP or Web Store — depends on env)
    await expect(page.getByRole("link", { name: /download extension|add to chrome/i })).toBeVisible();

    // Step: Unzip
    await expect(page.getByText(/unzip the file/i)).toBeVisible();

    // Step: Load in Chrome — mentions chrome://extensions
    await expect(page.getByText(/load in chrome/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /chrome:\/\/extensions/i })).toBeVisible();

    // Step: Sign in
    await expect(page.getByText("Sign in", { exact: true })).toBeVisible();
  });

  test("has link back to feed", async ({ page }) => {
    await page.goto("/extension/install");
    await expect(page.getByRole("link", { name: /back to feed/i })).toBeVisible();
  });

  test("download button links to ZIP file", async ({ page }) => {
    await page.goto("/extension/install");
    // The download link should point to the ZIP file (when no web store URL)
    // or the web store URL (when set). Either way, it should be a link.
    const downloadLink = page.getByRole("link", { name: /download extension|add to chrome/i });
    await expect(downloadLink).toBeVisible();
    const href = await downloadLink.first().getAttribute("href");
    expect(href).toBeTruthy();
  });
});

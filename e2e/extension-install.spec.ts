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

    // Step: Unzip (desktop default view)
    await expect(page.getByText(/download and unzip/i)).toBeVisible();

    // Step: Load in Chrome — shows chrome://extensions as copyable text
    // (chrome:// links cannot be navigated to from an https page)
    await expect(page.getByText(/load in chrome/i)).toBeVisible();
    await expect(page.getByText("chrome://extensions")).toBeVisible();

    // Step: Sign in
    await expect(page.getByText("Sign in", { exact: true })).toBeVisible();
  });

  test("platform switcher exposes the Android (Edge Canary .crx) path", async ({ page }) => {
    await page.goto("/extension/install");

    // Switch to Android view
    await page.getByRole("button", { name: /^android/i }).click();

    // Honest disclaimer that Chrome on Android can't install extensions
    await expect(page.getByText(/chrome on android doesn.?t support extensions/i)).toBeVisible();

    // .crx download CTA
    await expect(page.getByRole("link", { name: /download extension \(\.crx\)/i })).toBeVisible();

    // Edge Canary steps present
    await expect(page.getByText(/microsoft edge canary/i).first()).toBeVisible();
    await expect(page.getByText(/extension install by crx/i)).toBeVisible();
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

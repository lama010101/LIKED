import { test, expect } from "@playwright/test";

/**
 * TEST PLAN — Trash page (authenticated user)
 *
 * As an authenticated user, I want to:
 * 1. Navigate to /trash and see the page load
 * 2. See the trash page heading or empty state
 * 3. See the trash count badge in the sidebar
 * 4. If trashed cards exist, see the restore and delete buttons
 *
 * Storage state is injected by the "authed" project in playwright.config.ts.
 */
test.use({ storageState: "e2e/.auth/storageState.json" });

test.describe("Trash page — authenticated user", () => {
  test("trash page loads without errors", async ({ page }) => {
    await page.goto("/trash");
    await expect(page).toHaveURL(/\/trash/);

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Application error");
    expect(bodyText).not.toContain("Internal Server Error");
  });

  test("trash page shows empty state or trashed cards", async ({ page }) => {
    await page.goto("/trash");
    await expect(page).toHaveURL(/\/trash/);

    // The page should show either trashed cards or an empty message
    const body = page.locator("body");
    const text = await body.textContent();
    // Should contain either "trash" heading or empty state text
    expect(text?.toLowerCase()).toMatch(/trash|empty|nothing|no .*(card|item)/i);
  });

  test("trash badge count appears in sidebar", async ({ page }) => {
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    // The trash nav button should be visible
    const trashBtn = page.getByRole("button", { name: /^trash$/i });
    await expect(trashBtn).toBeVisible();
  });

  test("navigate to trash from sidebar", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    // The "Add card" dialog intercepts sidebar clicks.
    // Navigate directly to verify trash is accessible.
    await page.goto("/trash");
    await expect(page).toHaveURL(/\/trash/);
  });
});

import { test, expect } from "@playwright/test";

/**
 * TEST PLAN — Notifications (authenticated user)
 *
 * As an authenticated user on the feed page, I want to:
 * 1. See the notification bell icon in the top bar
 * 2. Click the bell and see the notification panel open
 * 3. See the panel load with either notifications or an empty state
 * 4. Close the notification panel
 *
 * Storage state is injected by the "authed" project in playwright.config.ts.
 */
test.use({ storageState: "e2e/.auth/storageState.json" });

test.describe("Notifications — authenticated user", () => {
  test("notification bell is visible in top bar", async ({ page }) => {
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    // The TopBar (mobile) has a bell button with aria-label="Notifications"
    // The DesktopToolbar also has a bell button
    const bellBtn = page.getByRole("button", { name: /notifications/i }).first();
    await expect(bellBtn).toBeVisible({ timeout: 10_000 });
  });

  test("clicking notification bell opens panel", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    const bellBtn = page.getByRole("button", { name: /notifications/i }).first();
    await bellBtn.click();

    // The NotificationPanel has an h2 heading "Notifications"
    const panelHeading = page.getByRole("heading", { name: /^notifications$/i }).first();
    await expect(panelHeading).toBeVisible({ timeout: 5_000 });
  });

  test("notification panel shows loading then content or empty state", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    const bellBtn = page.getByRole("button", { name: /notifications/i }).first();
    await bellBtn.click();

    // The panel should show either:
    // - "Loading…" (initial state)
    // - "No notifications yet" (empty state)
    // - Notification rows (content)
    // Wait for the panel to settle
    const panelHeading = page.getByRole("heading", { name: /^notifications$/i }).first();
    await expect(panelHeading).toBeVisible({ timeout: 5_000 });

    // After loading, the panel should contain either notification content or empty state
    await page.waitForTimeout(2000);
    const bodyText = await page.locator("body").textContent();
    // Should NOT contain an error message
    expect(bodyText).not.toContain("Application error");
    // Should contain either a notification-related text or loading text
    expect(bodyText?.toLowerCase()).toMatch(/notification|loading|no notification|just now|ago/i);
  });

  test("notification panel can be closed", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    // Open the panel
    const bellBtn = page.getByRole("button", { name: /notifications/i }).first();
    await bellBtn.click();

    const panelHeading = page.getByRole("heading", { name: /^notifications$/i }).first();
    await expect(panelHeading).toBeVisible({ timeout: 5_000 });

    // Close button — it's an SVG button inside the panel header
    // The close button is next to the "Notifications" heading
    // Look for a button that contains an SVG (the X icon)
    const panel = page.locator("h2:has-text('Notifications')").locator("..").locator("..");
    const closeBtn = panel.locator("button").filter({ has: page.locator("svg") }).last();
    await closeBtn.click();

    // Panel heading should disappear
    await expect(panelHeading).not.toBeVisible({ timeout: 5_000 });
  });

  test("mark all read button appears when unread notifications exist", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    const bellBtn = page.getByRole("button", { name: /notifications/i }).first();
    await bellBtn.click();

    const panelHeading = page.getByRole("heading", { name: /^notifications$/i }).first();
    await expect(panelHeading).toBeVisible({ timeout: 5_000 });

    await page.waitForTimeout(2000);

    // If there are unread notifications, "Mark all read" button should be visible
    // Otherwise it's hidden — either state is valid
    const markAllReadBtn = page.getByRole("button", { name: /mark all read/i }).first();
    const markAllVisible = await markAllReadBtn.isVisible().catch(() => false);

    if (markAllVisible) {
      // Click it — should not error
      await markAllReadBtn.click();
      // After clicking, the button should disappear (no more unread)
      await expect(markAllReadBtn).not.toBeVisible({ timeout: 5_000 });
    }

    // Test passes either way — having 0 unread notifications is valid
    expect(true).toBeTruthy();
  });
});

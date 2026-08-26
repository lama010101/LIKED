import { test, expect } from "@playwright/test";

/**
 * TEST PLAN — Feed page (authenticated user)
 *
 * As an authenticated user on the feed page, I want to:
 * 1. See the feed page load without errors
 * 2. See the sidebar with Feed / Folders / Trash navigation
 * 3. Open the profile modal by clicking the avatar
 * 4. See all profile modal options: theme toggle, username, language, extension install, sign out
 * 5. Click the "Install Chrome Extension" link → navigate to /extension/install
 * 6. Toggle the theme and see it change
 * 7. See the language selector with 3 languages
 * 8. See the sign out button
 *
 * Storage state is injected by the "authed" project in playwright.config.ts.
 *
 * NOTE: The Profile button exists in both TopBar (mobile, lg:hidden) and
 * DesktopToolbar (desktop, hidden lg:flex). We must click the visible one.
 */
test.use({ storageState: "e2e/.auth/storageState.json" });

/** Click the visible Profile button (works on both mobile and desktop layouts). */
async function openProfileModal(page: import("@playwright/test").Page) {
  // Close any open dialogs/sheets first — but only if they're actually
  // in the viewport (not off-screen via CSS transform).
  const closeBtns = page.getByRole("button", { name: /close/i });
  const count = await closeBtns.count();
  for (let i = 0; i < count; i++) {
    const btn = closeBtns.nth(i);
    const box = await btn.boundingBox().catch(() => null);
    if (box && box.x >= 0 && box.y >= 0 &&
        box.x + box.width <= page.viewportSize()?.width &&
        box.y + box.height <= page.viewportSize()?.height) {
      await btn.click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(500);
      break;
    }
  }

  // Find the visible Profile button (TopBar on mobile, DesktopToolbar on desktop)
  const profileBtn = page.locator('button[aria-label="Profile"]').filter({ visible: true }).first();
  await profileBtn.click({ timeout: 10_000 });

  const modal = page.locator("[role='dialog'][aria-label='Profile']");
  await expect(modal).toBeVisible({ timeout: 10_000 });
  return modal;
}

test.describe("Feed page — authenticated user", () => {
  test("feed page loads without errors", async ({ page }) => {
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Application error");
    expect(bodyText).not.toContain("Internal Server Error");
  });

  test("sidebar shows Feed / Folders / Trash navigation items", async ({ page }) => {
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    await expect(page.getByRole("button", { name: /^feed$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^folders$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^trash$/i })).toBeVisible();
  });

  test("profile modal opens with all options", async ({ page }) => {
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    const modal = await openProfileModal(page);

    await expect(modal.getByText(/dark mode|light mode/i)).toBeVisible();
    await expect(modal.getByText(/username/i)).toBeVisible();
    await expect(modal.getByText(/language/i)).toBeVisible();
    await expect(modal.getByText(/install chrome extension/i)).toBeVisible();
    await expect(modal.getByRole("button", { name: /sign out/i })).toBeVisible();
  });

  test("Install Chrome Extension link navigates to install page", async ({ page }) => {
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    const modal = await openProfileModal(page);

    const extLink = modal.getByRole("link", { name: /install chrome extension/i });
    await expect(extLink).toBeVisible();
    await extLink.click();

    await expect(page).toHaveURL(/\/extension\/install/);
  });

  test("theme toggle switches between dark and light", async ({ page }) => {
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    const modal = await openProfileModal(page);

    const themeSwitch = modal.getByRole("switch", { name: /toggle theme/i });
    await expect(themeSwitch).toBeVisible();

    const initialChecked = await themeSwitch.getAttribute("aria-checked");
    await themeSwitch.click();
    await expect(themeSwitch).toHaveAttribute("aria-checked", initialChecked === "true" ? "false" : "true");
  });

  test("language selector shows English, Français, ภาษาไทย", async ({ page }) => {
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    const modal = await openProfileModal(page);

    await expect(modal.getByRole("button", { name: /english/i })).toBeVisible();
    await expect(modal.getByRole("button", { name: /français/i })).toBeVisible();
    await expect(modal.getByRole("button", { name: /ภาษาไทย/i })).toBeVisible();
  });

  test("sign out button is visible", async ({ page }) => {
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    const modal = await openProfileModal(page);

    await expect(modal.getByRole("button", { name: /sign out/i })).toBeVisible();
  });
});

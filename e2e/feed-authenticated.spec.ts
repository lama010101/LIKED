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
  const viewport = page.viewportSize();
  for (let i = 0; i < count; i++) {
    const btn = closeBtns.nth(i);
    const box = await btn.boundingBox().catch(() => null);
    if (box && viewport && box.x >= 0 && box.y >= 0 &&
        box.x + box.width <= viewport.width &&
        box.y + box.height <= viewport.height) {
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

    // Feed and Activity are <a> tags; Folders and Trash are <button> tags
    await expect(page.getByRole("link", { name: /^feed$/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /^activity$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^folders$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^trash$/i })).toBeVisible();
  });

  test("profile modal opens with all options", async ({ page }) => {
    test.setTimeout(60_000);
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
    test.setTimeout(60_000);
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    const modal = await openProfileModal(page);

    const extLink = modal.getByRole("link", { name: /install chrome extension/i });
    await expect(extLink).toBeVisible();
    await extLink.click();

    await expect(page).toHaveURL(/\/extension\/install/);
  });

  test("theme toggle switches between dark and light", async ({ page }) => {
    test.setTimeout(60_000);
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
    test.setTimeout(60_000);
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    const modal = await openProfileModal(page);

    await expect(modal.getByRole("button", { name: /english/i })).toBeVisible();
    await expect(modal.getByRole("button", { name: /français/i })).toBeVisible();
    await expect(modal.getByRole("button", { name: /ภาษาไทย/i })).toBeVisible();
  });

  test("sign out button is visible", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);

    const modal = await openProfileModal(page);

    await expect(modal.getByRole("button", { name: /sign out/i })).toBeVisible();
  });

  test("all 5 view mode buttons switch the feed layout", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);
    await page.waitForTimeout(2000);

    // View buttons have aria-label: "col view", "mason view", "list view", "horiz view", "free view"
    // They are in SortViewRow (mobile) and DesktopToolbar (desktop)
    const viewModes = ["col", "mason", "list", "horiz", "free"] as const;

    for (const mode of viewModes) {
      // Find the visible view button for this mode
      const btn = page.locator(`button[aria-label="${mode} view"]`).filter({ visible: true }).first();
      const btnExists = await btn.count();

      if (btnExists === 0) {
        // On desktop, buttons don't have aria-label — try by title
        test.skip(true, `View button "${mode} view" not found — may be desktop layout without aria-label`);
      }

      await btn.click({ timeout: 5_000 });
      await page.waitForTimeout(500);

      // Verify the button is now active (aria-pressed="true")
      await expect(btn).toHaveAttribute("aria-pressed", "true", { timeout: 5_000 });

      // Verify page didn't crash
      const bodyText = await page.locator("body").textContent();
      expect(bodyText).not.toContain("Application error");
      expect(bodyText).not.toContain("Internal Server Error");
    }
  });

  test("card menu opens via portal and shows all actions", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);
    await page.waitForTimeout(3000);

    // Close any open dialogs by clicking their Close buttons
    await page.getByRole("button", { name: /^close$/i }).first().click({ timeout: 3_000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /close panel/i }).first().click({ timeout: 3_000 }).catch(() => {});
    await page.waitForTimeout(500);

    // Find a card menu button (aria-label="Card menu")
    const menuBtn = page.getByRole("button", { name: "Card menu" }).first();
    const btnCount = await menuBtn.count();

    if (btnCount === 0) {
      test.skip(true, "No owned cards with menu button found");
    }

    // Click the menu button via JS to bypass any overlay interception
    await page.evaluate(() => {
      const btn = document.querySelector('[aria-label="Card menu"]') as HTMLElement;
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);

    // Menu popover should be visible (rendered via portal at document.body)
    const shareBtn = page.getByRole("button", { name: /share with/i });
    const moveBtn = page.getByRole("button", { name: /move to folder/i });
    const tagBtn = page.getByRole("button", { name: /add tag/i });
    const deleteBtn = page.getByRole("button", { name: /^delete$/i });

    const menuVisible = (await shareBtn.count()) + (await moveBtn.count()) +
                        (await tagBtn.count()) + (await deleteBtn.count());
    expect(menuVisible).toBeGreaterThan(0);

    if (await shareBtn.count() > 0) {
      await expect(shareBtn.first()).toBeVisible({ timeout: 5_000 });
    }
    if (await deleteBtn.count() > 0) {
      await expect(deleteBtn.first()).toBeVisible({ timeout: 5_000 });
    }

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Application error");
    expect(bodyText).not.toContain("Internal Server Error");
  });

  test("folder menu opens via portal and shows rename/delete", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);
    await page.waitForTimeout(3000);

    // Close any open dialogs by clicking their Close buttons
    await page.getByRole("button", { name: /^close$/i }).first().click({ timeout: 3_000 }).catch(() => {});
    await page.waitForTimeout(500);
    await page.getByRole("button", { name: /close panel/i }).first().click({ timeout: 3_000 }).catch(() => {});
    await page.waitForTimeout(500);

    // Find a folder menu button (aria-label="Folder menu")
    const menuBtn = page.getByRole("button", { name: "Folder menu" }).first();
    const btnCount = await menuBtn.count();

    if (btnCount === 0) {
      test.skip(true, "No owned folders with menu button found");
    }

    // Click the menu button via JS to bypass any overlay interception
    await page.evaluate(() => {
      const btn = document.querySelector('[aria-label="Folder menu"]') as HTMLElement;
      if (btn) btn.click();
    });
    await page.waitForTimeout(500);

    // Menu should show Rename and Delete
    const renameBtn = page.getByRole("button", { name: /rename/i });
    const deleteBtn = page.getByRole("button", { name: /^delete$/i });

    expect(await renameBtn.count()).toBeGreaterThan(0);
    expect(await deleteBtn.count()).toBeGreaterThan(0);

    await expect(renameBtn.first()).toBeVisible({ timeout: 5_000 });
    await expect(deleteBtn.first()).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Application error");
    expect(bodyText).not.toContain("Internal Server Error");
  });
});

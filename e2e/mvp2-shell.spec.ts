import { test, expect } from "@playwright/test";

/**
 * MVP2 shell smoke (Phases 4-11) — authenticated user.
 * Asserts the NEW UI surface: header (search + bell + trash + avatar),
 * friends rail, folder section, 3-view toggle (list/masonry/columns),
 * FAB, and the new routes (/me, /notifications, /folders/[id], /youtube,
 * /organize). All data still comes from get_feed/get_folders — this spec
 * only asserts rendering, never data truth.
 */
test.use({ storageState: "e2e/.auth/storageState.json" });

test.describe("MVP2 shell — authenticated", () => {
  test("feed renders header, folder section, 3-view toggle", async ({ page }) => {
    await page.goto("/feed");
    await expect(page).toHaveURL(/\/feed/);
    await page.waitForLoadState("domcontentloaded");

    // header: search input + nav links
    await expect(page.getByRole("textbox").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /notifications/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /trash/i }).first()).toBeVisible();

    // folder section + 3-view toggle (Q21)
    await expect(page.locator("body")).toContainText(/folders/i);
    for (const label of [/list/i, /masonry/i, /columns/i]) {
      await expect(page.getByRole("button", { name: label }).first()).toBeVisible();
    }
  });

  test("view toggle switches card layout (me=1 shows foldered cards)", async ({ page }) => {
    await page.goto("/feed?me=1");
    const cards = page.locator(".cards");
    await expect(cards).toBeVisible({ timeout: 20_000 });
    await expect(cards).toHaveClass(/cards-list/);
    await page.getByRole("button", { name: /masonry/i }).first().click();
    await expect(cards).toHaveClass(/cards-masonry/);
    await page.getByRole("button", { name: /columns/i }).first().click();
    await expect(cards).toHaveClass(/cards-columns/);
  });

  test("FAB opens AddSheet with card/folder modes", async ({ page }) => {
    await page.goto("/feed");
    await page.locator(".fab").click();
    await expect(page.getByRole("button", { name: /^card$/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /^folder$/i })).toBeVisible();
    await expect(page.getByPlaceholder(/url|http/i)).toBeVisible();
    await page.getByRole("button", { name: /cancel/i }).click();
  });

  test("/me shows language picker + theme toggle", async ({ page }) => {
    await page.goto("/me");
    await expect(page).toHaveURL(/\/me/);
    const select = page.locator("select").first();
    await expect(select).toBeVisible();
    await expect(select.locator("option")).toHaveText([/en/i, /fr/i, /th/i]);
    // theme seg buttons (accessible name may include the field label)
    await expect(page.locator(".seg-btn", { hasText: /light/i })).toBeVisible();
    await expect(page.locator(".seg-btn", { hasText: /dark/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();
  });

  test("/notifications renders list + mark-all", async ({ page }) => {
    await page.goto("/notifications");
    await expect(page).toHaveURL(/\/notifications/);
    await expect(page.getByRole("button", { name: /mark all/i })).toBeVisible();
  });

  test("/trash renders empty state or items", async ({ page }) => {
    await page.goto("/trash");
    await expect(page).toHaveURL(/\/trash/);
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("Application error");
  });

  test("folder tile navigates to /folders/[id]", async ({ page }) => {
    await page.goto("/feed");
    await page.waitForLoadState("domcontentloaded");
    const tile = page.locator(".folder-tile").first();
    await expect(tile).toBeVisible({ timeout: 15_000 });
    const href = await tile.getAttribute("href");
    expect(href).toMatch(/\/folders\//);
    await tile.click();
    await page.waitForURL(/\/folders\//, { timeout: 30_000 });
    await expect(page.getByRole("link", { name: /home/i }).first()).toBeVisible();
  });

  test("/youtube shows consent-gated connect flow", async ({ page }) => {
    await page.goto("/youtube");
    await expect(page).toHaveURL(/\/youtube/);
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("Application error");
  });

  test("/organize renders batch list", async ({ page }) => {
    await page.goto("/organize");
    await expect(page).toHaveURL(/\/organize/);
    const body = await page.locator("body").innerText();
    expect(body).not.toContain("Application error");
  });
});

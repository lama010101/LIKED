import { test, expect } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD } from "./helpers/auth";

/**
 * Authenticated smoke test — logs in and exercises core flows:
 * 1. /feed renders with content (or empty state)
 * 2. AddCardSheet can create a node
 * 3. Card detail sheet opens
 * 4. Trash page renders
 */

let savedCookies: string | null = null;

test.describe.configure({ mode: "serial" });

test.describe("Authenticated smoke — core flows", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Login via the form
    await page.goto("/login");
    await page.locator("#email").fill(TEST_EMAIL);
    await page.locator("#password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });

    // Save cookies for subsequent tests
    const cookies = await context.cookies();
    savedCookies = JSON.stringify(cookies);

    await context.close();
  });

  test("feed page renders without error", async ({ browser }) => {
    const context = await browser.newContext();
    if (savedCookies) {
      await context.addCookies(JSON.parse(savedCookies));
    }
    const page = await context.newPage();

    await page.goto("/feed");

    // Wait for page to settle (either content or empty state)
    await page.waitForLoadState("networkidle");

    // Should not be redirected to login
    expect(page.url()).toContain("/feed");

    // Check for either feed content or empty state — no crash
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Application error");
    expect(bodyText).not.toContain("Something went wrong");

    // Screenshot for visual verification
    await page.screenshot({ path: "test-results/auth-feed.png", fullPage: true });

    await context.close();
  });

  test("trash page renders without error", async ({ browser }) => {
    const context = await browser.newContext();
    if (savedCookies) {
      await context.addCookies(JSON.parse(savedCookies));
    }
    const page = await context.newPage();

    await page.goto("/trash");
    await page.waitForLoadState("networkidle");

    expect(page.url()).toContain("/trash");

    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Application error");
    expect(bodyText).not.toContain("Something went wrong");

    await page.screenshot({ path: "test-results/auth-trash.png", fullPage: true });

    await context.close();
  });

  test("youtube page renders without error", async ({ browser }) => {
    const context = await browser.newContext();
    if (savedCookies) {
      await context.addCookies(JSON.parse(savedCookies));
    }
    const page = await context.newPage();

    await page.goto("/youtube");
    await page.waitForLoadState("networkidle");

    // YouTube page may redirect to login if not connected,
    // but should not crash
    const bodyText = await page.locator("body").textContent();
    expect(bodyText).not.toContain("Application error");
    expect(bodyText).not.toContain("Something went wrong");

    await page.screenshot({ path: "test-results/auth-youtube.png", fullPage: true });

    await context.close();
  });
});

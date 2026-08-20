import { test as setup, expect } from "@playwright/test";
import { TEST_EMAIL, TEST_PASSWORD, STORAGE_STATE } from "./auth";

/**
 * Global setup: login once and save storage state.
 * This runs as the "setup" project before all other tests.
 */
setup("global setup — login", async ({ page }) => {
  setup.setTimeout(60_000);
  await page.goto("/login");
  await page.locator("#email").fill(TEST_EMAIL);
  await page.locator("#password").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });
  await page.context().storageState({ path: STORAGE_STATE });
});

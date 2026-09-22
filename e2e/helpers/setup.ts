import { test as setup, expect } from "@playwright/test";
import { injectSession, STORAGE_STATE } from "./auth";

/**
 * Global setup: authenticate once and save storage state.
 * This runs as the "setup" project before all other tests.
 * Auth is Google-OAuth-only (PRD §41.2) — the session is obtained
 * programmatically via the Supabase token endpoint and injected as
 * the @supabase/ssr session cookie.
 */
setup("global setup — login", async ({ page, baseURL }) => {
  setup.setTimeout(60_000);
  const origin = baseURL ?? "http://localhost:3001";
  await injectSession(page.context(), origin);
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/feed/, { timeout: 30_000 });
  await page.context().storageState({ path: STORAGE_STATE });
});

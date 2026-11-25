import { test, expect } from "@playwright/test";
import { getE2ESession, injectSession } from "./helpers/auth";
import {
  fixtureRowCounts,
  readOwnerPrefs,
  userRowExists,
  type FixtureRowCounts,
} from "./helpers/v2Fixtures";

// P0-19 Settings + Credits + Sign out (PLAN-V2-002 §8.1, PRD §6.9, PRD §13
// items 21 and 25). The TEST_EMAIL owner is used as-is; preferences changed
// here are restored (language en, region cleared, email on).

test.describe.configure({ mode: "serial" });

let ownerId = "";

test.beforeAll(async () => {
  const session = await getE2ESession();
  ownerId = session.user.id as string;
});

test("settings shows every §6.9 group; P1 and delete rows stay hidden", async ({
  page,
  baseURL,
}) => {
  await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
  await expect(page.getByRole("radiogroup", { name: "Language" })).toBeVisible();
  await expect(page.getByTestId("settings-language-option")).toHaveCount(4);
  await expect(page.getByTestId("settings-region-input")).toBeVisible();
  await expect(page.getByTestId("settings-email-toggle")).toBeVisible();
  await expect(page.getByTestId("settings-signout")).toBeVisible();
  await expect(page.getByTestId("settings-version")).toHaveText(/^LIKED · version \d+\.\d+\.\d+$/);
  await expect(page.getByRole("link", { name: "Privacy policy" })).toHaveAttribute("href", "/privacy");
  await expect(page.getByRole("link", { name: "Terms of use" })).toHaveAttribute("href", "/terms");
  await expect(page.getByTestId("settings-credits-link")).toHaveAttribute("href", "/settings/credits");

  // P1 theme/colour rows and the not-yet-built delete row are not rendered.
  await expect(page.getByText("Theme", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Primary color", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("settings-delete-account")).toHaveCount(0);
  await expect(page.locator('a[href*="/settings/delete"]')).toHaveCount(0);
});

test("language switch updates strings instantly and persists to user_prefs", async ({
  page,
  baseURL,
}) => {
  await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/settings");
  await page.locator('[data-testid="settings-language-option"][data-language="fr"]').click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Paramètres");
  const cookies = await page.context().cookies();
  expect(cookies.find((c) => c.name === "LIKED_LOCALE")?.value).toBe("fr");
  await expect
    .poll(async () => (await readOwnerPrefs(ownerId))?.tmdb_lang)
    .toBe("fr-FR");

  await page.locator('[data-testid="settings-language-option"][data-language="en"]').click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings");
  await expect.poll(async () => (await readOwnerPrefs(ownerId))?.tmdb_lang).toBe("en-US");
});

test("region suggestion comes from x-vercel-ip-country and saves", async ({ page, baseURL }) => {
  await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.context().setExtraHTTPHeaders({ "x-vercel-ip-country": "FR" });
  await page.goto("/settings");
  const suggested = page.getByTestId("settings-region-suggested");
  await expect(suggested).toContainText("Suggested from your connection: FR");
  await page.getByTestId("settings-region-use").click();
  await expect(page.getByTestId("settings-region-input")).toHaveValue("FR");
  await expect.poll(async () => (await readOwnerPrefs(ownerId))?.region_code).toBe("FR");

  // Clear it again so the test account keeps no invented region.
  await page.getByTestId("settings-region-input").fill("");
  await page.getByTestId("settings-region-save").click();
  await expect.poll(async () => (await readOwnerPrefs(ownerId))?.region_code).toBeNull();
  await page.context().setExtraHTTPHeaders({});
});

test("email notification toggle persists", async ({ page, baseURL }) => {
  await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/settings");
  const toggle = page.getByTestId("settings-email-toggle");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect.poll(async () => (await readOwnerPrefs(ownerId))?.notify_email).toBe(false);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect.poll(async () => (await readOwnerPrefs(ownerId))?.notify_email).toBe(true);
});

test("credits shows the exact TMDB and JustWatch notices", async ({ page, baseURL }) => {
  await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/settings/credits");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Credits");
  await expect(page.getByText("This product uses the TMDB API but is not endorsed or certified by TMDB.")).toBeVisible();
  await expect(page.getByText("Streaming availability data is provided by JustWatch.")).toBeVisible();
});

test("a11y baseline on settings", async ({ page, baseURL }) => {
  await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/settings");
  const issues = await page.evaluate(() => {
    const out: string[] = [];
    document.querySelectorAll("button, a[href], input").forEach((el) => {
      const name =
        el.getAttribute("aria-label") ||
        (el.textContent ?? "").trim() ||
        (el as HTMLInputElement).value ||
        "";
      if (!name) out.push("unnamed:" + el.outerHTML.slice(0, 60));
    });
    const h1s = document.querySelectorAll("h1").length;
    if (h1s !== 1) out.push(`h1-count=${h1s}`);
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    const dup = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    if (dup.length > 0) out.push("duplicate-ids:" + dup.join(","));
    return out;
  });
  expect(issues).toEqual([]);
});

test("sign out ends this device's session only and deletes nothing", async ({ page, baseURL }) => {
  await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/settings");
  const before: FixtureRowCounts = await fixtureRowCounts();
  expect(await userRowExists(ownerId)).toBe(true);

  await page.getByTestId("settings-signout").click();
  await expect(page).toHaveURL(/\/login/);
  const cookies = await page.context().cookies();
  expect(cookies.filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))).toHaveLength(0);
  expect(await userRowExists(ownerId)).toBe(true);
  const after = await fixtureRowCounts();
  expect(after).toEqual(before);
});

test("unauthenticated /settings redirects to /login", async ({ page }) => {
  await page.context().clearCookies();
  const res = await page.request.get("/settings", { maxRedirects: 0 });
  expect([302, 307, 308]).toContain(res.status());
  expect(res.headers()["location"] ?? "").toContain("/login");
});

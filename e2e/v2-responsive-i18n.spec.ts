import { test, expect, type Page } from "@playwright/test";
import { injectSession } from "./helpers/auth";
import { startProdAudit, type ProdAudit } from "./helpers/prodAudit";
import {
  createGuest,
  deleteGuest,
  deleteItems,
  getOwnerAskToken,
  submitRecommendations,
  upsertTmdbItem,
} from "./helpers/v2Fixtures";

// C20: 360px per-locale overflow/font audit. Owner screens use a real session;
// friend screens use the real /r/[token] flow. The check is intentionally
// mechanical: no horizontal overflow and every primary container is no wider
// than its clipping box; Thai body text must resolve through Noto Sans Thai.
test.describe.configure({ mode: "serial" });

const LOCALES = ["en", "fr", "es", "th"] as const;
const stamp = String(Date.now()).slice(-8);
const externalId = `97${stamp}`;
let audit: ProdAudit;
let itemId = "";
let contributorId = "";
let askToken = "";

async function audit360(page: Page, locale: string, label: string) {
  const result = await page.evaluate(() => {
    const htmlOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    const bodyOverflow = document.body.scrollWidth - document.body.clientWidth;
    const bad: string[] = [];
    for (const el of Array.from(document.querySelectorAll("main, section, article, header, [role='dialog'], form"))) {
      if (el.scrollWidth > el.clientWidth + 1) bad.push(`${el.tagName.toLowerCase()}.${(el as HTMLElement).className}`);
    }
    return { htmlOverflow, bodyOverflow, bad, font: getComputedStyle(document.body).fontFamily };
  });
  expect(result.htmlOverflow, `${locale}/${label} html overflow`).toBeLessThanOrEqual(1);
  expect(result.bodyOverflow, `${locale}/${label} body overflow`).toBeLessThanOrEqual(1);
  expect(result.bad, `${locale}/${label} clipped containers`).toEqual([]);
  if (locale === "th") expect(result.font).toContain("Noto Sans Thai");
}

test.beforeAll(async () => {
  audit = await startProdAudit();
  itemId = await upsertTmdbItem(externalId, {
    name: "zz-c20 responsive fixture",
    release_date: "2021-01-01",
    original_language: "en",
    overview: "responsive fixture",
    genres: ["tmdb:18"],
  });
  const guest = await createGuest(`zz-c20-${stamp}`);
  contributorId = guest.contributorId;
});

test.afterAll(async () => {
  if (contributorId) await deleteGuest(contributorId);
  if (itemId) await deleteItems([itemId]);
  await audit.assertEqual();
});

test("owner screens and detail sheet at 360px in en/fr/es/th", async ({ page, baseURL }) => {
  const origin = baseURL ?? "http://localhost:3001";
  const session = await injectSession(page.context(), origin);
  askToken = (await getOwnerAskToken(session.user.id as string)) ?? "";
  if (!askToken) {
    await page.goto("/inbox");
    askToken = (await getOwnerAskToken(session.user.id as string)) ?? "";
  }
  expect(askToken).toBeTruthy();
  await submitRecommendations(askToken, contributorId, [
    { item_id: itemId, rating: 80, platform: "fixture", comment: "responsive fixture comment" },
  ]);

  await page.setViewportSize({ width: 360, height: 740 });
  for (const locale of LOCALES) {
    await page.context().addCookies([{ name: "LIKED_LOCALE", value: locale, url: origin }]);
    for (const [route, label] of [
      ["/inbox", "inbox"],
      ["/settings", "settings"],
      ["/settings/credits", "credits"],
      ["/privacy", "privacy"],
      ["/terms", "terms"],
      ["/delete-account", "delete-account"],
      ["/delete-account/confirm?t=malformed", "delete-confirm"],
    ] as const) {
      await page.goto(route);
      await page.waitForLoadState("domcontentloaded");
      await audit360(page, locale, label);
    }

    await page.goto("/inbox");
    const card = page.locator(`[data-testid="inbox-card"][data-item-id="${itemId}"]`);
    await expect(card).toHaveCount(1);
    await card.getByRole("button").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await audit360(page, locale, "detail-sheet");
    await page.keyboard.press("Escape");
  }
});

test("friend landing/add/receipt screens at 360px in en/fr/es/th", async ({ page, baseURL }) => {
  const origin = baseURL ?? "http://localhost:3001";
  expect(askToken).toBeTruthy();
  await page.setViewportSize({ width: 360, height: 740 });

  for (const locale of LOCALES) {
    await page.context().addCookies([{ name: "LIKED_LOCALE", value: locale, url: origin }]);
    await page.goto(`/r/${askToken}`);
    await page.waitForLoadState("domcontentloaded");
    await audit360(page, locale, "friend-landing");
  }

  // Drive one complete real flow in English: landing -> PoW session -> add ->
  // paste/resolve -> send -> receipt. The other locales above prove the same
  // localized shell at the entry point; the controls are shared components.
  await page.context().addCookies([{ name: "LIKED_LOCALE", value: "en", url: origin }]);
  await page.goto(`/r/${askToken}`);
  await page.getByLabel(/your name/i).fill(`zz-c20-ui-${stamp}`);
  await page.getByRole("button", { name: /^start$/i }).click();
  await expect(page.locator('input[type="url"]')).toBeVisible({ timeout: 15000 });
  await audit360(page, "en", "friend-add");
  await page.locator('input[type="url"]').fill("https://www.themoviedb.org/movie/603");
  await page.getByRole("button", { name: /^paste$/i }).click();
  await expect(page.getByRole("button", { name: /^details$/i }).first()).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: /send to/i }).click();
  await expect(page.getByText(/sent|receipt|thanks/i).first()).toBeVisible({ timeout: 15000 });
  await audit360(page, "en", "friend-receipt");
});

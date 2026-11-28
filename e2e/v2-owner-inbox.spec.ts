import { test, expect } from "@playwright/test";
import { injectSession } from "./helpers/auth";
import { startProdAudit, type ProdAudit } from "./helpers/prodAudit";
import {
  createFixtureUser,
  createGuest,
  deleteFixtureUser,
  deleteGuest,
  deleteItems,
  fixtureRowCounts,
  guestGetAsk,
  getOwnerAskToken,
  rpcAnon,
  rpcAs,
  signInFixtureUser,
  submitRecommendations,
  upsertTmdbItem,
  type FixtureGuest,
  type FixtureRowCounts,
} from "./helpers/v2Fixtures";

// P0-16 owner inbox (PLAN-V2-002 §8.1, PRD §6.2/§6.5/§13 items 3, 6, 9).
// Two service-client guests recommend the same TMDB item; the owner (TEST_EMAIL)
// sees ONE card. Fixture rows are removed in afterAll and row counts are
// printed before/after.

test.describe.configure({ mode: "serial" });

const itemExternalId = "99" + String(Date.now()).slice(-8);
const guests: FixtureGuest[] = [];
const createdItemIds: string[] = [];
let itemId = "";
let askToken = "";
let before: FixtureRowCounts;
let audit: ProdAudit;

test.beforeAll(async () => {
  audit = await startProdAudit();
  before = await fixtureRowCounts();
  guests.push(await createGuest("zz-e2e-Alice"), await createGuest("zz-e2e-Bob"));
  itemId = await upsertTmdbItem(itemExternalId, {
    name: "zz-e2e Fixture Title",
    release_date: "2020-05-01",
    original_language: "en",
    overview: "zz-e2e fixture overview",
    runtime_min: "102",
    tmdb_rating: "7.4",
    tmdb_votes: "1234",
    genres: ["tmdb:18"],
  });
  createdItemIds.push(itemId);
});

test.afterAll(async () => {
  for (const g of guests) {
    try {
      await deleteGuest(g.contributorId);
    } catch (e) {
      console.log(`cleanup guest failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  await deleteItems(createdItemIds);
  const after = await fixtureRowCounts();
  console.log(`FIXTURE ROW COUNTS before=${JSON.stringify(before)}`);
  console.log(`FIXTURE ROW COUNTS after=${JSON.stringify(after)}`);
  await audit.assertEqual();
});

test("owner /inbox loads and ensure_my_ask creates one link", async ({ page, baseURL }) => {
  const session = await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/inbox");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("To watch");
  askToken = (await getOwnerAskToken(session.user.id as string)) ?? "";
  expect(askToken.length).toBeGreaterThanOrEqual(32);
});

test("two guests, same item: ONE card with recommender_count 2", async ({ page, baseURL }) => {
  expect(askToken).not.toBe("");
  await submitRecommendations(askToken, guests[0].contributorId, [
    { item_id: itemId, rating: 80, comment: "zz-e2e quote A", platform: "zz-e2e cinema" },
  ]);
  await submitRecommendations(askToken, guests[1].contributorId, [
    { item_id: itemId, rating: 60, comment: "zz-e2e quote B", platform: "zz-e2e disc" },
  ]);

  await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/inbox");

  const card = page.locator(`[data-testid="inbox-card"][data-item-id="${itemId}"]`);
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute("data-recommender-count", "2");
  await expect(card).toHaveAttribute("data-rater-count", "2");
  await expect(card).toHaveAttribute("data-friends-avg", "70");
  await expect(card).toContainText("70%");
  await expect(card).toContainText("(2)");
  await expect(page.getByTestId("inbox-tab-count")).toHaveText("1");
});

test("detail sheet: Friends/TMDB rings and complete recommender rows", async ({
  page,
  baseURL,
}) => {
  const session = await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  const detailRpc = await rpcAs(session.access_token, "get_inbox_item", { p_item_id: itemId });
  expect(detailRpc.status).toBe(200);
  const detailBody = detailRpc.body as Record<string, unknown>;
  expect(Object.keys(detailBody).sort()).toEqual(["item", "owner_status", "recommenders"]);
  expect(detailBody).not.toHaveProperty("offers");
  expect(detailBody).not.toHaveProperty("region_missing");

  await page.goto("/inbox");
  const card = page.locator(`[data-testid="inbox-card"][data-item-id="${itemId}"]`);
  await expect(card).toContainText("zz-e2e quote");
  await card.getByRole("button").first().click();

  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId("inbox-ring-friends")).toContainText("70%");
  await expect(sheet.getByTestId("inbox-ring-tmdb")).toContainText("74%");
  const rows = sheet.getByTestId("inbox-recommender-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.filter({ hasText: "zz-e2e-Alice" })).toContainText("80%");
  await expect(rows.filter({ hasText: "zz-e2e-Alice" })).toContainText("zz-e2e quote A");
  await expect(rows.filter({ hasText: "zz-e2e-Alice" })).toContainText("zz-e2e cinema");
  await expect(rows.filter({ hasText: "zz-e2e-Bob" })).toContainText("60%");
  await expect(rows.filter({ hasText: "zz-e2e-Bob" })).toContainText("zz-e2e quote B");
  await expect(rows.filter({ hasText: "zz-e2e-Bob" })).toContainText("zz-e2e disc");
  await expect(rows.locator("time")).toHaveCount(2);
  expect(await rows.locator("time").first().getAttribute("datetime")).toBeTruthy();
  await expect(sheet).not.toContainText("offers");
  await expect(sheet).not.toContainText("region_missing");
  expect(await sheet.locator('img[src*="tmdb"], img[src*="themoviedb"]').count()).toBe(0);

  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("share bar: regenerate kills the old token, the new one resolves", async ({
  page,
  baseURL,
}) => {
  await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/inbox");
  await page.getByTestId("inbox-share-button").click();
  const urlInput = page.getByTestId("inbox-share-url");
  await expect(urlInput).toBeVisible();
  const oldUrl = await urlInput.inputValue();
  expect(oldUrl).toContain("/r/");
  const oldToken = oldUrl.split("/r/")[1];
  expect(oldToken).toBe(askToken);

  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Regenerate link" }).click();
  await expect(urlInput).not.toHaveValue(oldUrl);
  const newToken = (await urlInput.inputValue()).split("/r/")[1];
  expect(newToken).not.toBe(oldToken);

  const oldProbe = await guestGetAsk(oldToken);
  expect(oldProbe.ok).toBe(false);
  expect(oldProbe.message ?? "").toContain("ASK_NOT_ACTIVE");
  const newProbe = await guestGetAsk(newToken);
  expect(newProbe.ok).toBe(true);
  askToken = newToken;
});

test("no horizontal overflow at 360 / 768 / 1280", async ({ page, baseURL }) => {
  await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/inbox");
    await expect(page.locator(`[data-testid="inbox-card"][data-item-id="${itemId}"]`)).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});

test("dark OS: dark first paint, no theme flash (SSR data-theme=system)", async ({
  page,
  baseURL,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/inbox");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
  const html = await page.content();
  expect(html).toContain('data-theme="system"');
  const bg = await page.evaluate(() => {
    const scope = document.querySelector("[data-ui='v2'] > div");
    return scope ? getComputedStyle(scope).backgroundColor : "";
  });
  expect(bg).toBe("rgb(10, 10, 18)");
});

test("a11y baseline: names, alt text, one h1, no duplicate ids", async ({ page, baseURL }) => {
  await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/inbox");
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
    document.querySelectorAll("img").forEach((img) => {
      if (!img.hasAttribute("alt")) out.push("img-without-alt");
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

test("unauthenticated: /inbox redirects to /login and anon get_inbox is rejected", async ({
  page,
}) => {
  await page.context().clearCookies();
  const res = await page.request.get("/inbox", { maxRedirects: 0 });
  expect([302, 307, 308]).toContain(res.status());
  expect(res.headers()["location"] ?? "").toContain("/login");

  const anon = await rpcAnon("get_inbox", { p_status: "to_watch" });
  expect(anon.status).toBeGreaterThanOrEqual(400);
});

test("user B never sees user A's inbox (no IDOR surface)", async () => {
  const b = await createFixtureUser();
  try {
    const token = await signInFixtureUser(b);
    const res = await rpcAs(token, "get_inbox", { p_status: "to_watch" });
    expect(res.status).toBe(200);
    const body = res.body as { cards: unknown[]; counts: { to_watch: number } };
    expect(body.cards).toEqual([]);
    expect(body.counts.to_watch).toBe(0);
  } finally {
    await deleteFixtureUser(b);
  }
});

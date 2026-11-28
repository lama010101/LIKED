import { test, expect } from "@playwright/test";
import { injectSession } from "./helpers/auth";
import { startProdAudit, type ProdAudit } from "./helpers/prodAudit";
import {
  createGuest,
  deleteGuest,
  deleteItems,
  fixtureRowCounts,
  getOwnerAskToken,
  submitRecommendations,
  upsertTmdbItem,
  type FixtureGuest,
  type FixtureRowCounts,
} from "./helpers/v2Fixtures";

// P0-17 friend rail (PRD §6.3, PRD §13 item 8): All = sum, per-friend badge,
// single-select, open clears exactly that friend's unseen, viewing All marks
// nothing. Fixtures are removed in afterAll with row counts printed.

test.describe.configure({ mode: "serial" });

const run = String(Date.now()).slice(-7);
const aliceItems: string[] = [];
const bobItems: string[] = [];
const createdItemIds: string[] = [];
const guests: FixtureGuest[] = [];
let aliceId = "";
let bobId = "";
let askToken = "";
let before: FixtureRowCounts;
let audit: ProdAudit;

test.beforeAll(async () => {
  audit = await startProdAudit();
  before = await fixtureRowCounts();
  const alice = await createGuest("zz-e2e-RailAlice");
  const bob = await createGuest("zz-e2e-RailBob");
  guests.push(alice, bob);
  aliceId = alice.contributorId;
  bobId = bob.contributorId;

  for (let i = 0; i < 3; i++) {
    const id = await upsertTmdbItem(`98${run}${i}`, {
      name: `zz-e2e Rail Item ${i}`,
      release_date: "2021-03-0" + (i + 1),
      tmdb_rating: "6.5",
    });
    createdItemIds.push(id);
    if (i < 2) aliceItems.push(id);
    else bobItems.push(id);
  }
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

test("fixtures land in the rail: All = sum of friend counts", async ({ page, baseURL }) => {
  const session = await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/inbox");
  askToken = (await getOwnerAskToken(session.user.id as string)) ?? "";
  expect(askToken.length).toBeGreaterThanOrEqual(32);

  await submitRecommendations(askToken, aliceId, [
    { item_id: aliceItems[0], rating: 90 },
    { item_id: aliceItems[1], rating: 70 },
  ]);
  await submitRecommendations(askToken, bobId, [{ item_id: bobItems[0], rating: 50 }]);

  await page.goto("/inbox");
  const alice = page.locator(`[data-testid="rail-friend"][data-contributor-id="${aliceId}"]`);
  const bob = page.locator(`[data-testid="rail-friend"][data-contributor-id="${bobId}"]`);
  await expect(alice).toHaveAttribute("data-unseen", "2");
  await expect(bob).toHaveAttribute("data-unseen", "1");
  await expect(alice.getByTestId("rail-badge")).toHaveText("2");
  await expect(bob.getByTestId("rail-badge")).toHaveText("1");

  const sum = await page.$$eval('[data-testid="rail-friend"]', (els) =>
    els.reduce((s, e) => s + Number(e.getAttribute("data-unseen") ?? 0), 0)
  );
  const all = Number(await page.getByTestId("rail-all").getAttribute("data-all-unseen"));
  expect(all).toBe(sum);
  expect(all).toBeGreaterThanOrEqual(3);
});

test("opening a friend filters and clears exactly that friend's unseen", async ({
  page,
  baseURL,
}) => {
  await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/inbox");
  const alice = page.locator(`[data-testid="rail-friend"][data-contributor-id="${aliceId}"]`);
  await expect(alice).toHaveAttribute("data-unseen", "2");
  const allStart = Number(await page.getByTestId("rail-all").getAttribute("data-all-unseen"));

  await alice.click();
  await expect(page.getByTestId("inbox-card")).toHaveCount(2);
  await expect(page.locator(`[data-testid="inbox-card"][data-item-id="${aliceItems[0]}"]`)).toBeVisible();
  await expect(page.locator(`[data-testid="inbox-card"][data-item-id="${aliceItems[1]}"]`)).toBeVisible();
  await expect(alice).toHaveAttribute("data-unseen", "0");
  await expect(alice.getByTestId("rail-badge")).toHaveCount(0);
  const allAfter = Number(await page.getByTestId("rail-all").getAttribute("data-all-unseen"));
  expect(allAfter).toBe(allStart - 2);
  await expect(page.locator(`[data-testid="rail-friend"][data-contributor-id="${bobId}"]`)).toHaveAttribute(
    "data-unseen",
    "1"
  );
});

test("tapping the selected avatar clears the filter; viewing All marks nothing", async ({
  page,
  baseURL,
}) => {
  await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/inbox");
  const alice = page.locator(`[data-testid="rail-friend"][data-contributor-id="${aliceId}"]`);
  await alice.click();
  await expect(page.getByTestId("inbox-card")).toHaveCount(2);
  const allFiltered = Number(await page.getByTestId("rail-all").getAttribute("data-all-unseen"));

  await alice.click();
  await expect(page.getByTestId("inbox-card")).toHaveCount(3);
  await expect(page.locator(`[data-testid="inbox-card"][data-item-id="${bobItems[0]}"]`)).toBeVisible();
  expect(Number(await page.getByTestId("rail-all").getAttribute("data-all-unseen"))).toBe(allFiltered);
  await expect(page.locator(`[data-testid="rail-friend"][data-contributor-id="${bobId}"]`)).toHaveAttribute(
    "data-unseen",
    "1"
  );
});

test("opening the second friend clears the last unseen and keeps names accessible", async ({
  page,
  baseURL,
}) => {
  await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/inbox");
  const bob = page.locator(`[data-testid="rail-friend"][data-contributor-id="${bobId}"]`);
  const allStart = Number(await page.getByTestId("rail-all").getAttribute("data-all-unseen"));
  await bob.click();
  await expect(page.getByTestId("inbox-card")).toHaveCount(1);
  await expect(bob).toHaveAttribute("data-unseen", "0");
  await expect(bob.getByTestId("rail-badge")).toHaveCount(0);
  const allAfter = Number(await page.getByTestId("rail-all").getAttribute("data-all-unseen"));
  expect(allAfter).toBe(allStart - 1);

  await expect(page.getByTestId("rail-all")).toHaveAttribute("aria-label", /^All, \d+ unseen$/);
  await expect(bob).toHaveAttribute("aria-label", /^zz-e2e-RailBob, \d+ unseen$/);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

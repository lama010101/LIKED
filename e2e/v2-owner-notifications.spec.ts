import { test, expect } from "@playwright/test";
import { injectSession } from "./helpers/auth";
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

// P0-18 UI part (PLAN-V2-002 §8.1): the recommendation_received case in
// NotificationsView. One submission → one notification "{name} recommended
// N titles." linking to /inbox. (The email sender is a separate task.)

test.describe.configure({ mode: "serial" });

const itemExternalId = "97" + String(Date.now()).slice(-8);
let guest: FixtureGuest | null = null;
let itemId = "";
let before: FixtureRowCounts;

test.beforeAll(async () => {
  before = await fixtureRowCounts();
  guest = await createGuest("zz-e2e-Notif");
  itemId = await upsertTmdbItem(itemExternalId, {
    name: "zz-e2e Notif Item",
    release_date: "2019-09-09",
    tmdb_rating: "7.0",
  });
});

test.afterAll(async () => {
  if (guest) {
    try {
      await deleteGuest(guest.contributorId);
    } catch (e) {
      console.log(`cleanup guest failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  await deleteItems([itemId]);
  const after = await fixtureRowCounts();
  console.log(`FIXTURE ROW COUNTS before=${JSON.stringify(before)}`);
  console.log(`FIXTURE ROW COUNTS after=${JSON.stringify(after)}`);
});

test("recommendation_received renders and links to the inbox", async ({ page, baseURL }) => {
  const session = await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/inbox");
  const token = (await getOwnerAskToken(session.user.id as string)) ?? "";
  expect(token.length).toBeGreaterThanOrEqual(32);
  await submitRecommendations(token, guest!.contributorId, [{ item_id: itemId, rating: 75 }]);

  await page.goto("/notifications");
  const item = page.locator(".notif-list li", { hasText: "zz-e2e-Notif recommended 1 title." });
  await expect(item).toBeVisible();
  await expect(item.locator("a")).toHaveAttribute("href", "/inbox");
});

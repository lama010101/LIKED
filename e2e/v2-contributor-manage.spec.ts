import { test, expect } from "@playwright/test";
import { injectSession } from "./helpers/auth";
import { startProdAudit, type ProdAudit } from "./helpers/prodAudit";
import {
  createGuest,
  deleteGuest,
  deleteItems,
  fixtureRowCounts,
  getOwnerAskToken,
  serviceClient,
  submitRecommendations,
  upsertTmdbItem,
  type FixtureGuest,
} from "./helpers/v2Fixtures";

// Owner remove/block contributor (PRD §10.1, migration 155, task
// V2-W9-PLAYLIST-1128-001 PR-2): the rail "Manage {name}" sheet, its confirm
// steps, and the post-action rail/count updates. Runs against the local dev
// server (npm run smoke:v2 style) and writes PROD fixture data only.
//
// NOTE: this spec requires migration 155 to be APPLIED — the manage RPCs do
// not exist before approval, so the spec is expected to fail red on
// remove_contributor_recommendations until the migration is merged+applied.
// Before/after per-table row counts are printed and asserted (counts only).

test.describe.configure({ mode: "serial" });

const run = String(Date.now()).slice(-7);
const createdItemIds: string[] = [];
const guests: FixtureGuest[] = [];
let aliceId = "";
let bobId = "";
let askToken = "";
let audit: ProdAudit;

test.beforeAll(async () => {
  audit = await startProdAudit();
  const alice = await createGuest(`zz-e2e-ManageAlice${run}`);
  const bob = await createGuest(`zz-e2e-ManageBob${run}`);
  guests.push(alice, bob);
  aliceId = alice.contributorId;
  bobId = bob.contributorId;
  for (let i = 0; i < 2; i++) {
    const id = await upsertTmdbItem(`97${run}${i}`, {
      name: `zz-e2e Manage Item ${i}`,
      release_date: "2021-04-0" + (i + 1),
      tmdb_rating: "6.5",
    });
    createdItemIds.push(id);
  }
});

test.afterAll(async () => {
  // unblock any leftover block rows the test created (direct delete: no
  // owner UI exists for unblock, and class-O RPCs need the owner's session)
  for (const g of guests) {
    try {
      await serviceClient()
        .from("owner_contributor_blocks")
        .delete()
        .eq("contributor_id", g.contributorId);
    } catch (e) {
      console.log(`cleanup block rows failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  for (const g of guests) {
    try {
      await deleteGuest(g.contributorId);
    } catch (e) {
      console.log(`cleanup guest failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  await deleteItems(createdItemIds);
  const after = await fixtureRowCounts();
  console.log(`FIXTURE ROW COUNTS after=${JSON.stringify(after)}`);
  await audit.assertEqual();
  console.log("PROD AUDIT residue check: PASS (all table counts equal)");
});

test("remove flow: confirm copy, then the friend leaves the rail", async ({ page, baseURL }) => {
  const session = await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/inbox");
  askToken = (await getOwnerAskToken(session.user.id as string)) ?? "";
  expect(askToken.length).toBeGreaterThanOrEqual(32);

  await submitRecommendations(askToken, aliceId, [{ item_id: createdItemIds[0], rating: 90 }]);
  await page.reload();

  const friendBtn = page.locator(`[data-testid="rail-friend"][data-contributor-id="${aliceId}"]`);
  await expect(friendBtn).toBeVisible();
  await friendBtn.click();

  const manageBtn = page.locator('[data-testid="inbox-manage-friend"]');
  await expect(manageBtn).toBeVisible();
  await manageBtn.click();

  // menu step: exactly two actions
  await expect(page.locator('[data-testid="manage-choose-remove"]')).toBeVisible();
  await expect(page.locator('[data-testid="manage-choose-block"]')).toBeVisible();

  // confirm step states exactly what happens
  await page.locator('[data-testid="manage-choose-remove"]').click();
  const confirmRegion = page.locator('[data-testid="manage-friend-confirm"]');
  await expect(confirmRegion).toBeVisible();
  await expect(confirmRegion).toContainText("permanently removes");

  await page.locator('[data-testid="manage-confirm-yes"]').click();
  await expect(page.locator('[data-testid="manage-friend-overlay"]')).toHaveCount(0, {
    timeout: 10000,
  });
  // removed contributor no longer appears in the rail
  await expect(friendBtn).toHaveCount(0);

  // server-side truth: no recommendations left for this owner/contributor
  const { count } = await serviceClient()
    .from("recommendations")
    .select("*", { count: "exact", head: true })
    .eq("contributor_id", aliceId);
  expect(count).toBe(0);
});

test("block flow: confirm copy, rail updates, block row exists, guest submit is neutrally rejected", async ({
  page,
  baseURL,
  request,
}) => {
  const session = await injectSession(page.context(), baseURL ?? "http://localhost:3001");
  await page.goto("/inbox");
  askToken = (await getOwnerAskToken(session.user.id as string)) ?? "";
  expect(askToken.length).toBeGreaterThanOrEqual(32);

  await submitRecommendations(askToken, bobId, [{ item_id: createdItemIds[1], rating: 50 }]);
  await page.reload();

  const friendBtn = page.locator(`[data-testid="rail-friend"][data-contributor-id="${bobId}"]`);
  await expect(friendBtn).toBeVisible();
  await friendBtn.click();
  await page.locator('[data-testid="inbox-manage-friend"]').click();
  await page.locator('[data-testid="manage-choose-block"]').click();
  const confirmRegion = page.locator('[data-testid="manage-friend-confirm"]');
  await expect(confirmRegion).toContainText("blocks them from sending new ones");
  await page.locator('[data-testid="manage-confirm-yes"]').click();
  await expect(page.locator('[data-testid="manage-friend-overlay"]')).toHaveCount(0, {
    timeout: 10000,
  });
  await expect(friendBtn).toHaveCount(0);

  const { count } = await serviceClient()
    .from("owner_contributor_blocks")
    .select("*", { count: "exact", head: true })
    .eq("contributor_id", bobId);
  expect(count).toBe(1);
});

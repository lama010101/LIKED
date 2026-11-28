import { expect, test } from "@playwright/test";
import { getE2ESession } from "./helpers/auth";
import { deleteGuest, getOwnerAskToken, serviceClient } from "./helpers/v2Fixtures";

// Guest-side UI e2e for V2-W9-CLAIM-1128-001. It drives the real landing +
// PoW/session mint, mocks only catalog/submit/receipt responses (so no item or
// recommendation fixture is needed), uses the real intent endpoint, and stops
// at the Google redirect. A real Google consent round trip is MANUAL-VERIFY.

const ITEM_ID = "323e4567-e89b-42d3-a456-426614174000";
const ORIGIN = process.env.BASE_URL ?? "http://localhost:3001";
const guestName = `zz-claim-${Date.now()}`;

let askToken = "";
let contributorId: string | null = null;

test.beforeAll(async () => {
  const session = await getE2ESession();
  askToken = (await getOwnerAskToken(session.user.id as string)) ?? "";
  expect(askToken.length).toBeGreaterThanOrEqual(32);
});

test.afterAll(async () => {
  if (!contributorId) {
    const { data } = await serviceClient()
      .from("contributors")
      .select("id")
      .eq("display_name", guestName)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    contributorId = (data as { id: string } | null)?.id ?? null;
  }
  if (contributorId) await deleteGuest(contributorId);
});

test("receipt Make-your-own-list block reaches the Google redirect with exact claim return path", async ({ page }) => {
  await page.route("**/api/ask/search*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        tmdb: [{ source: "tmdb", kind: "movie", external_id: "12345", title: "zz-claim movie", year: 2024, poster_path: null }],
        youtube: { status: "ok" },
      }),
    });
  });
  await page.route("**/api/ask/resolve", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ item_id: ITEM_ID, source: "tmdb", kind: "movie", name: "zz-claim movie", year: 2024, poster_path: null, thumb_url: null }),
    });
  });
  await page.route("**/api/ask/submit*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ submission_id: null, accepted: 1, replayed: false, owner_display_name: "Owner" }) });
  });
  await page.route("**/api/ask/receipt*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [{ item_id: ITEM_ID, kind: "movie", name: "zz-claim movie", year: 2024, poster_path: null, thumb_url: null, rating: null, platform_text: null, comment: null, updated_at: null }] }) });
  });

  await page.goto(`/r/${askToken}`);
  await page.locator("#friend-name").fill(guestName);
  await page.getByRole("button", { name: /^start$/i }).click();
  await expect(page.locator("#ask-search")).toBeVisible({ timeout: 20_000 });
  await page.locator("#ask-search").fill("zz");
  await page.getByRole("button", { name: /zz-claim movie/i }).click();
  await page.getByRole("button", { name: /send to/i }).click();

  await expect(page.getByTestId("claim-own-list")).toBeVisible();
  const seenUrls: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/auth/v1/authorize") || url.includes("accounts.google.com")) seenUrls.push(url);
  });
  await page.getByRole("button", { name: /continue with google/i }).click();
  await expect.poll(() => seenUrls.some((url) => url.includes("accounts.google.com") || url.includes("/auth/v1/authorize")), { timeout: 20_000 }).toBe(true);

  const authorize = seenUrls.find((url) => url.includes("/auth/v1/authorize"));
  expect(authorize).toBeTruthy();
  const redirectTo = new URL(authorize!).searchParams.get("redirect_to");
  expect(redirectTo).toBeTruthy();
  const callback = new URL(redirectTo!);
  expect(callback.origin).toBe(new URL(ORIGIN).origin);
  expect(callback.pathname).toBe("/callback");
  expect(callback.searchParams.get("next")).toBe(`/r/${askToken}?claim=1`);
  expect(authorize!).not.toMatch(/youtube/i);
});

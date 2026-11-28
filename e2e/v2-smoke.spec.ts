import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { injectSession, getE2ESession } from "./helpers/auth";
import { solvePowChallenge } from "../lib/ask/humanCheck";
import { startProdAudit, type ProdAudit } from "./helpers/prodAudit";
import {
  deleteGuest,
  deleteItems,
  getOwnerAskToken,
  serviceClient,
  upsertTmdbItem,
} from "./helpers/v2Fixtures";

// V2-W7 WP-E local smoke suite: the core v2 flows against the local dev
// server (BASE_URL, default http://localhost:3001). NOT wired into CI —
// v2 e2e writes PROD data, so this runs on demand via `npm run smoke:v2`.
// Every spec snapshots PROD per-table counts and fails loudly on residue.

test.describe.configure({ mode: "serial" });

const ORIGIN = process.env.BASE_URL ?? "http://localhost:3001";
const stamp = String(Date.now()).slice(-8);
const itemExternalId = "98" + stamp;
const GUEST_A = `zz-smoke-A-${stamp}`;
const GUEST_B = `zz-smoke-B-${stamp}`;
const GUEST_C = `zz-smoke-C-${stamp}`;

let audit: ProdAudit;
let askToken = "";
let itemId = "";
const contributorIds: string[] = [];

interface GuestSession {
  cookie: string;
  contributorId: string;
}

async function guestViaRoutes(
  request: APIRequestContext,
  name: string
): Promise<GuestSession> {
  const ch = await request.get("/api/ask/session");
  expect(ch.ok()).toBeTruthy();
  const { challenge, difficulty } = (await ch.json()) as {
    challenge: string;
    difficulty: number;
  };
  const captchaToken = solvePowChallenge(challenge, difficulty);
  const mint = await request.post("/api/ask/session", {
    headers: { Origin: ORIGIN, "Content-Type": "application/json" },
    data: { token: askToken, name, captchaToken },
  });
  expect(mint.ok()).toBeTruthy();
  const setCookie = mint.headers()["set-cookie"] ?? "";
  const cookie = setCookie
    .split(",")
    .map((c) => c.trim().split(";")[0])
    .find((c) => c.startsWith("__Host-liked_guest="));
  expect(cookie, "guest cookie minted").toBeTruthy();
  const { data: row } = await serviceClient()
    .from("contributors")
    .select("id")
    .eq("display_name", name)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(row?.id, `contributor row for ${name}`).toBeTruthy();
  return { cookie: cookie!, contributorId: (row as { id: string }).id };
}

async function submitViaRoutes(
  request: APIRequestContext,
  guest: GuestSession
) {
  const res = await request.post(`/api/ask/submit?token=${askToken}`, {
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      Cookie: guest.cookie,
    },
    data: {
      client_batch_id: randomUUID(),
      items: [
        {
          item_id: itemId,
          rating: 80,
          comment: "zz-smoke",
          platform: "zz-smoke cinema",
        },
      ],
    },
  });
  return res;
}

test.beforeAll(async () => {
  const session = await getE2ESession();
  const ownerId = session.user.id as string;
  askToken = (await getOwnerAskToken(ownerId)) ?? "";
  expect(askToken.length).toBeGreaterThanOrEqual(32);
  audit = await startProdAudit();
});

test.afterAll(async () => {
  for (const id of contributorIds) {
    try {
      await deleteGuest(id);
    } catch (e) {
      console.log(`cleanup guest failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  await deleteItems([itemId]);
  await audit.assertEqual();
  console.log("PROD AUDIT residue check: PASS (all table counts equal)");
});

test("guest submit through the real routes (PoW -> cookie -> submit)", async ({
  request,
}) => {
  itemId = await upsertTmdbItem(itemExternalId, {
    name: "zz-smoke Fixture Title",
    release_date: "2021-01-01",
    original_language: "en",
    overview: "zz-smoke fixture",
    runtime_min: "90",
    tmdb_rating: "6.5",
    tmdb_votes: "100",
    genres: ["tmdb:18"],
  });
  const guestA = await guestViaRoutes(request, GUEST_A);
  contributorIds.push(guestA.contributorId);
  const res = await submitViaRoutes(request, guestA);
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { accepted?: number };
  expect(body.accepted).toBe(1);
});

test("two friends on one title merge into a single inbox card", async ({
  page,
  request,
  baseURL,
}) => {
  const guestB = await guestViaRoutes(request, GUEST_B);
  contributorIds.push(guestB.contributorId);
  const resB = await submitViaRoutes(request, guestB);
  expect(resB.ok()).toBeTruthy();

  await injectSession(page.context(), baseURL ?? ORIGIN);
  await page.goto("/inbox");
  const card = page.locator(`[data-testid="inbox-card"][data-item-id="${itemId}"]`);
  await expect(card).toHaveCount(1);
  await expect(card).toHaveAttribute("data-recommender-count", "2");
  await expect(card).toHaveAttribute("data-rater-count", "2");
  await expect(card).toHaveAttribute("data-friends-avg", "80");
});

test("friend rail counts: per-friend badges sum to All", async ({
  page,
  baseURL,
}) => {
  await injectSession(page.context(), baseURL ?? ORIGIN);
  await page.goto("/inbox");
  const badges = await page.$$eval('[data-testid="rail-friend"]', (els) =>
    els.map((el) => ({
      id: el.getAttribute("data-contributor-id") ?? "",
      badge: Number(el.querySelector('[data-testid="rail-badge"]')?.textContent ?? 0),
    }))
  );
  const ours = badges.filter((b) => contributorIds.includes(b.id));
  expect(ours.length).toBe(2);
  const sum = ours.reduce((a, b) => a + b.badge, 0);
  const all = Number(
    await page.getByTestId("rail-all").getAttribute("data-all-unseen")
  );
  // All counts every unseen recommendation; ours are a subset, so All >= sum.
  expect(all).toBeGreaterThanOrEqual(sum);
  expect(sum).toBeGreaterThan(0);
});

test("settings sign-out ends the session and deletes nothing", async ({
  page,
  baseURL,
}) => {
  await injectSession(page.context(), baseURL ?? ORIGIN);
  await page.goto("/settings");
  await expect(page.getByTestId("settings-signout")).toBeVisible();
  await page.getByTestId("settings-signout").click();
  await expect(page).toHaveURL(/\/login/);
  const cookies = await page.context().cookies();
  expect(
    cookies.filter((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"))
  ).toHaveLength(0);
  const res = await page.request.get("/settings", { maxRedirects: 0 });
  expect([302, 307, 308]).toContain(res.status());
});

test("guest delete-my-data removes the contributor and its rows", async ({
  request,
}) => {
  const guestC = await guestViaRoutes(request, GUEST_C);
  contributorIds.push(guestC.contributorId);
  const del = await request.post("/api/ask/delete-me", {
    headers: {
      Origin: ORIGIN,
      "Content-Type": "application/json",
      Cookie: guestC.cookie,
    },
    data: {},
  });
  expect(del.ok()).toBeTruthy();
  const body = (await del.json()) as { deleted?: boolean };
  expect(body.deleted).toBe(true);
  const { data: gone } = await serviceClient()
    .from("contributors")
    .select("id")
    .eq("id", guestC.contributorId)
    .maybeSingle();
  expect(gone).toBeNull();
  contributorIds.splice(contributorIds.indexOf(guestC.contributorId), 1);
});

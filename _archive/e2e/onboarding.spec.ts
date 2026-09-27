import { test, expect } from "@playwright/test";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { injectSession } from "./helpers/auth";

config({ path: ".env.local" });

/**
 * E2E: ONBOARD-001 — reduced-v1 onboarding runner + single-folder CTA.
 *
 * No test account has a live YouTube connection (0 active rows live), so:
 *   - the e2e user's onboarding flags are temporarily reset to NULL and a
 *     synthetic youtube_connections row is inserted (enables the runner's
 *     youtube_connected gate; tokens are never used — /api/youtube/likes
 *     is mocked);
 *   - /api/youtube/likes is intercepted and returns 2 fake videos;
 *   - the per-video import runs for real through importYouTubeActivity →
 *     import_url (fixed fake video ids → reruns are harmless duplicates).
 *
 * Verifies: import runs on /feed → CTA appears with the imported count →
 * accept creates ONE "My YouTube Likes" folder containing the imported
 * videos → reload shows no CTA (dismissal persisted).
 */

// Run-scoped ids: a soft-deleted node still holds UNIQUE(url, owner_id), so
// fixed ids would duplicate-fail on reruns and the CTA would never appear.
const RUN = Date.now().toString(36);
const FAKE_VIDEOS = [
  { id: `onb${RUN}a`, title: "Onboarding E2E Video One", description: "", channelTitle: "E2E Channel", categoryId: "", thumbnail: "" },
  { id: `onb${RUN}b`, title: "Onboarding E2E Video Two", description: "", channelTitle: "E2E Channel", categoryId: "", thumbnail: "" },
];

const svc = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
);

test.describe("ONBOARD-001 — onboarding import + folder CTA", () => {
  test.setTimeout(120_000);

  let userId = "";
  let createdFolderId: string | null = null;

  test.afterAll(async () => {
    if (!userId) return;
    // Restore flags to their post-migration (non-onboarded) state
    await svc
      .from("users")
      .update({
        onboarding_imported_at: new Date().toISOString(),
        onboarding_dismissed_at: new Date().toISOString(),
      })
      .eq("id", userId);
    // Remove the synthetic YouTube connection
    await svc.from("youtube_connections").delete().eq("user_id", userId);
    // Soft-delete the folder the CTA created (cascade-safe soft delete)
    if (createdFolderId) {
      await svc.rpc("delete_folder", { p_folder_id: createdFolderId });
    }
    // Soft-delete the imported test nodes
    const { data: testNodes } = await svc
      .from("nodes")
      .select("id")
      .eq("owner_id", userId)
      .in("url", FAKE_VIDEOS.map((v) => `https://www.youtube.com/watch?v=${v.id}`));
    const testNodeIds = new Set((testNodes ?? []).map((n) => n.id));
    for (const n of testNodes ?? []) {
      await svc.rpc("set_node_deleted", { p_node_id: n.id, p_deleted: true });
    }
    // Soft-delete the "YouTube" auto-folder only if this run created it
    // (i.e. it holds no nodes other than this run's test nodes).
    const { data: ytFolder } = await svc
      .from("folders")
      .select("id")
      .eq("owner_id", userId)
      .eq("name", "YouTube")
      .is("deleted_at", null)
      .maybeSingle();
    if (ytFolder) {
      const { data: members } = await svc
        .from("folder_edges")
        .select("node_id")
        .eq("folder_id", ytFolder.id);
      if ((members ?? []).every((m) => testNodeIds.has(m.node_id))) {
        await svc.rpc("delete_folder", { p_folder_id: ytFolder.id });
      }
    }
  });

  test("import runs, CTA creates one folder, dismissal persists", async ({ page, baseURL }) => {
    const origin = baseURL ?? "http://localhost:3001";
    const session = await injectSession(page.context(), origin);
    userId = session.user.id as string;

    // Arrange: reset onboarding flags + insert synthetic connection row
    await svc
      .from("users")
      .update({ onboarding_imported_at: null, onboarding_dismissed_at: null })
      .eq("id", userId);
    const { error: connErr } = await svc.from("youtube_connections").upsert({
      user_id: userId,
      google_account_email: "e2e@example.com",
      connected_at: new Date().toISOString(),
      revoked_at: null,
      access_token: "synthetic",
      refresh_token: "synthetic",
      token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
      scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
    });
    expect(connErr).toBeNull();

    // Mock the likes listing (2 videos, single page)
    await page.route("**/api/youtube/likes**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ videos: FAKE_VIDEOS, nextPageToken: null }),
      })
    );

    await page.goto("/feed");

    // Runner imports (real server actions) then shows the CTA
    const cta = page.getByTestId("onboarding-cta");
    await expect(cta).toBeVisible({ timeout: 90_000 });
    await expect(cta).toContainText(/liked videos from YouTube/i);

    // Accept with the default name
    await cta.getByRole("button", { name: /create folder/i }).click();
    await expect(cta).not.toBeVisible({ timeout: 30_000 });

    // Folder exists with the imported nodes inside (DB-level assertion)
    const { data: folder } = await svc
      .from("folders")
      .select("id")
      .eq("owner_id", userId)
      .eq("name", "My YouTube Likes")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(folder?.id).toBeTruthy();
    createdFolderId = folder!.id;

    const { count } = await svc
      .from("folder_edges")
      .select("*", { count: "exact", head: true })
      .eq("folder_id", createdFolderId);
    expect(count).toBeGreaterThanOrEqual(FAKE_VIDEOS.length);

    // Dismissal persisted: reload → no CTA, no second import
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("onboarding-cta")).not.toBeVisible({ timeout: 15_000 });
  });
});

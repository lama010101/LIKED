/**
 * Scheduled YouTube sync (YT-SYNC-CRON-001).
 *
 * Server-side equivalent of the popup/topbar sync: for every user with an
 * active youtube_connections row, page likes.list (newest first) and import
 * each video through the same import_url RPC path the interactive sync uses.
 *
 * Early stop: likes.list is ordered most-recent-first, so once DUP_STOP
 * consecutive videos are already in the library the rest of the history is
 * assumed imported and the run moves on — keeps routine runs O(new likes).
 * A global deadline + per-user cap bound the run inside serverless limits.
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  getStoredYouTubeToken,
  fetchLikedVideos,
  fetchVideoCategoryName,
} from "@/lib/youtube/client";
import { importUrl, DuplicateNodeError } from "@/lib/db/nodes";
import { downloadAndUploadThumbnail } from "@/app/lib/actions/createNode";
import { logger } from "@/lib/utils/logger";

const DUP_STOP = 5;
const MAX_IMPORTS_PER_USER = 200;
const RUN_DEADLINE_MS = 50_000;

export interface YouTubeVideoInput {
  url: string;
  title: string | null;
  description: string | null;
  channelTitle: string | null;
  categoryId: string;
  thumbnailUrl: string | null;
  targetFolderId?: string | null;
}

/**
 * Shared per-video import core used by the interactive server action and the
 * cron sync alike: language → category-name tag → tag labels → thumbnail →
 * atomic import_url RPC. Throws DuplicateNodeError on (url, owner) dupes and
 * Error on other failures.
 */
export async function importYouTubeVideoForUser(
  userId: string,
  input: YouTubeVideoInput,
  accessToken?: string
): Promise<string> {
  // User's preferred language for tag/description i18n (fall back to en).
  let languageCode = "en";
  try {
    const db = getSupabaseServiceClient();
    const { data: userRow } = await db
      .from("users")
      .select("language_code")
      .eq("id", userId)
      .single();
    if (userRow?.language_code) {
      languageCode = userRow.language_code.slice(0, 8);
    }
  } catch {
    // Non-fatal.
  }

  // Category name for auto-tagging — needs a valid YouTube token; best-effort.
  let categoryTagName: string | null = null;
  if (input.categoryId) {
    let token = accessToken;
    if (!token) {
      const tokenResult = await getStoredYouTubeToken(userId);
      if (tokenResult.ok) token = tokenResult.token.accessToken;
    }
    if (token) {
      categoryTagName = await fetchVideoCategoryName(token, input.categoryId);
    }
  }

  const tagLabels = Array.from(
    new Set(
      ["YouTube", input.channelTitle?.trim() || null, categoryTagName]
        .filter((t): t is string => !!t && t.length > 0)
    )
  );

  let thumbnailKey: string | null = null;
  const thumbUrl = input.thumbnailUrl?.trim() || null;
  if (thumbUrl) {
    thumbnailKey = await downloadAndUploadThumbnail(thumbUrl, userId);
  }

  // Single transaction: node + cause + edges + tags + folder edge (Rule 9).
  const node = await importUrl(userId, {
    url: input.url,
    title: input.title?.trim() || null,
    thumbnailKey,
    languageCode,
    description: input.description?.trim() || null,
    newTagLabels: tagLabels,
    existingTagIds: [],
    folderId: input.targetFolderId ?? null,
    note: null,
    nodeType: "video",
    autoFolderName: "YouTube",
  });
  return node.id;
}

export interface SyncUserResult {
  userId: string;
  imported: number;
  skippedDuplicates: number;
  error?: string;
}

/** Sync one connected user's liked videos within the run's deadline. */
async function syncUser(userId: string, deadline: number): Promise<SyncUserResult> {
  const auth = await getStoredYouTubeToken(userId);
  if (!auth.ok) {
    return { userId, imported: 0, skippedDuplicates: 0, error: auth.error };
  }
  const accessToken = auth.token.accessToken;

  let imported = 0;
  let skippedDuplicates = 0;
  let consecutiveDupes = 0;
  let pageToken: string | undefined;

  outer: do {
    if (Date.now() > deadline) break;
    const res = await fetchLikedVideos(accessToken, pageToken);
    if (res.error) {
      return { userId, imported, skippedDuplicates, error: res.error };
    }
    for (const v of res.videos) {
      if (Date.now() > deadline || imported >= MAX_IMPORTS_PER_USER) break outer;
      try {
        await importYouTubeVideoForUser(
          userId,
          {
            url: `https://www.youtube.com/watch?v=${v.id}`,
            title: v.title,
            description: v.description,
            channelTitle: v.channelTitle,
            categoryId: v.categoryId,
            thumbnailUrl: v.thumbnail || null,
          },
          accessToken
        );
        imported += 1;
        consecutiveDupes = 0;
      } catch (err) {
        if (err instanceof DuplicateNodeError) {
          skippedDuplicates += 1;
          // Newest-first ordering: a run of existing items means the rest of
          // the history was already synced — stop paging.
          if (++consecutiveDupes >= DUP_STOP) break outer;
        } else {
          consecutiveDupes = 0;
          logger.error("[youtube-sync] import failed for", userId, ":", (err as Error).message);
        }
      }
    }
    pageToken = res.nextPageToken ?? undefined;
  } while (pageToken);

  return { userId, imported, skippedDuplicates };
}

/** Sync every user with an active YouTube connection, sequentially. */
export async function syncAllConnectedUsers(): Promise<{
  users: number;
  imported: number;
  skippedDuplicates: number;
  errors: { userId: string; error: string }[];
  timedOut: boolean;
}> {
  const db = getSupabaseServiceClient();
  // Token columns aren't in the generated Database type (same cast as client.ts).
  const { data, error } = await db
    .from("youtube_connections")
    .select("user_id")
    .is("revoked_at", null)
    .not("refresh_token", "is", null);
  if (error) throw new Error(`Failed to list YouTube connections: ${error.message}`);

  const deadline = Date.now() + RUN_DEADLINE_MS;
  const results: SyncUserResult[] = [];
  for (const row of (data ?? []) as unknown as { user_id: string }[]) {
    if (Date.now() > deadline) break;
    results.push(
      await syncUser(row.user_id, deadline).catch((err) => ({
        userId: row.user_id,
        imported: 0,
        skippedDuplicates: 0,
        error: err instanceof Error ? err.message : "sync failed",
      }))
    );
  }

  return {
    users: results.length,
    imported: results.reduce((n, r) => n + r.imported, 0),
    skippedDuplicates: results.reduce((n, r) => n + r.skippedDuplicates, 0),
    errors: results
      .filter((r): r is SyncUserResult & { error: string } => !!r.error)
      .map((r) => ({ userId: r.userId, error: r.error })),
    timedOut: Date.now() > deadline,
  };
}

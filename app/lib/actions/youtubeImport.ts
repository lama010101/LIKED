"use server";

/**
 * YouTube Activity Import — intelligent import server action.
 *
 * Saves a YouTube video (or subscription channel) as a LIKED node with:
 *   - Full description from the YouTube Data API
 *   - Auto-tags: "YouTube", channel name, video category name
 *   - Auto-folder: "YouTube" (created if it doesn't exist)
 *   - Thumbnail downloaded from YouTube and uploaded to Supabase Storage
 *
 * Uses the atomic `import_url` RPC (Rule 9 compliant — single transaction:
 * node + sort_cache + cause + edge + tag edges + folder edge + translations).
 *
 * Ref: PRD §15.1, §22 — write system rules.
 */

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { DuplicateNodeError } from "@/lib/db/nodes";
import { importYouTubeVideoForUser } from "@/lib/youtube/sync";

export type YouTubeImportResult =
  | { ok: true; nodeId: string }
  | { ok: false; error: string; code?: "duplicate" | "invalid" | "unauthenticated" | "unknown" };

export interface YouTubeImportInput {
  /** YouTube video URL (https://www.youtube.com/watch?v=<id>) */
  url: string;
  /** Video title from YouTube API */
  title: string;
  /** Video description from YouTube API (full) */
  description: string;
  /** Channel name (becomes a tag) */
  channelTitle: string;
  /** YouTube category ID (fetched at save time → category name tag) */
  categoryId: string;
  /** Thumbnail URL from YouTube (downloaded + uploaded to Storage) */
  thumbnailUrl: string | null;
  /** Language code for tag/description i18n */
  languageCode?: string | null;
  /** N12: explicit folder target (active folder context wins over selection).
   *  When set, the node lands here inside the same import transaction and
   *  the "YouTube" auto-folder is skipped; when null, "YouTube" is the
   *  fallback folder. */
  targetFolderId?: string | null;
}

export async function importYouTubeActivity(
  input: YouTubeImportInput
): Promise<YouTubeImportResult> {
  // 1. Authenticate
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return { ok: false, error: "Not authenticated", code: "unauthenticated" };
  }

  // 2. Validate URL
  const url = input.url?.trim() || "";
  if (!url) {
    return { ok: false, error: "URL is required.", code: "invalid" };
  }
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { ok: false, error: "Invalid URL.", code: "invalid" };
    }
  } catch {
    return { ok: false, error: "Invalid URL.", code: "invalid" };
  }

  // 3-7. Shared per-video core (lib/youtube/sync.ts): language → category
  //      tag → thumbnail → atomic import_url RPC (single transaction).
  //      Auto-folder "YouTube" inside the RPC; explicit targetFolderId wins.
  try {
    const nodeId = await importYouTubeVideoForUser(user.id, {
      url,
      title: input.title,
      description: input.description,
      channelTitle: input.channelTitle,
      categoryId: input.categoryId,
      thumbnailUrl: input.thumbnailUrl,
      targetFolderId: input.targetFolderId,
    });

    revalidatePath("/feed");
    return { ok: true, nodeId };
  } catch (err) {
    if (err instanceof DuplicateNodeError) {
      return {
        ok: false,
        error: "This video is already in your feed.",
        code: "duplicate",
      };
    }
    const message = err instanceof Error ? err.message : "Failed to save video.";
    return { ok: false, error: message, code: "unknown" };
  }
}

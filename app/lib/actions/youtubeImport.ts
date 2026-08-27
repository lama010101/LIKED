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
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { importUrl, DuplicateNodeError } from "@/lib/db/nodes";
import { fetchVideoCategoryName } from "@/lib/youtube/client";
import { downloadAndUploadThumbnail } from "@/app/lib/actions/createNode";
import { logger } from "@/lib/utils/logger";

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
}

/**
 * Get or create a "YouTube" folder for the user.
 * Mirrors getOrCreateUnsortedFolder pattern from lib/db/folders.ts.
 */
async function getOrCreateYouTubeFolder(userId: string): Promise<string> {
  const supabase = getSupabaseServiceClient();

  // Check if user already has a "YouTube" folder
  const { data: existing } = await supabase
    .from("folders")
    .select("id")
    .eq("owner_id", userId)
    .eq("name", "YouTube")
    .is("deleted_at", null)
    .limit(1);

  if (existing && existing.length > 0) {
    return existing[0].id as string;
  }

  // Create "YouTube" folder
  const { data: created, error: createError } = await supabase
    .from("folders")
    .insert({
      name: "YouTube",
      owner_id: userId,
      parent_folder_id: null,
      is_project: true,
      color_hex: "#ff0000",
      deleted_at: null,
    })
    .select("id")
    .single();

  if (createError || !created) {
    // Race condition: another request may have created it concurrently.
    const { data: retry } = await supabase
      .from("folders")
      .select("id")
      .eq("owner_id", userId)
      .eq("name", "YouTube")
      .is("deleted_at", null)
      .limit(1);
    if (retry && retry.length > 0) {
      return retry[0].id as string;
    }
    throw new Error(`Failed to create YouTube folder: ${createError?.message ?? "unknown"}`);
  }

  const folderId = created.id as string;

  // Insert folder_tree self-reference (required by folder_tree schema)
  await supabase
    .from("folder_tree")
    .insert({ folder_id: folderId, ancestor_id: folderId, depth: 0 });

  return folderId;
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

  const {
    data: { session },
  } = await supabase.auth.getSession();

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

  // 3. Resolve user's preferred language
  let languageCode = input.languageCode ?? "en";
  try {
    const db = getSupabaseServiceClient();
    const { data: userRow } = await db
      .from("users")
      .select("language_code")
      .eq("id", user.id)
      .single();
    if (userRow?.language_code) {
      languageCode = userRow.language_code.slice(0, 8);
    }
  } catch {
    // Fall back to 'en' — non-fatal.
  }

  // 4. Fetch video category name from YouTube API (for auto-tagging)
  let categoryTagName: string | null = null;
  if (input.categoryId && session?.provider_token) {
    categoryTagName = await fetchVideoCategoryName(
      session.provider_token,
      input.categoryId
    );
  }

  // 5. Build auto-tags: "YouTube" + channel name + category name (deduped)
  const tagLabels = Array.from(
    new Set(
      [
        "YouTube",
        input.channelTitle?.trim() || null,
        categoryTagName,
      ]
        .filter((t): t is string => !!t && t.length > 0)
    )
  );

  // 6. Download + upload thumbnail to Storage
  let thumbnailKey: string | null = null;
  const thumbUrl = input.thumbnailUrl?.trim() || null;
  if (thumbUrl) {
    thumbnailKey = await downloadAndUploadThumbnail(thumbUrl, user.id);
  }

  // 7. Get or create "YouTube" folder
  let folderId: string | null = null;
  try {
    folderId = await getOrCreateYouTubeFolder(user.id);
  } catch (err) {
    // Non-fatal: node will go to "Unsorted" if folder creation fails.
    logger.error("Failed to create YouTube folder:", err);
  }

  // 8. Atomic write via import_url RPC (single transaction, Rule 9 compliant)
  try {
    const node = await importUrl(user.id, {
      url,
      title: input.title?.trim() || null,
      thumbnailKey,
      languageCode,
      description: input.description?.trim() || null,
      newTagLabels: tagLabels,
      existingTagIds: [],
      folderId,
      note: null,
    });

    revalidatePath("/feed");
    return { ok: true, nodeId: node.id };
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

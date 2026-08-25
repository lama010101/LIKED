"use server";

/**
 * Server action for node creation (P8-T02, PRD §15.1 + §22).
 *
 * Flow:
 *   1. Authenticate the caller.
 *   2. Invoke the `extract-node-metadata` Edge Function via the shared
 *      `extractNodeMetadata` helper so the function can identify the caller
 *      for rate-limit + activity_log purposes (§15.1 #4).
 *   3. Pass the metadata into `createNode`, which fires the
 *      `create_node_with_metadata` RPC — a single Postgres transaction
 *      that inserts the node, sort cache, and tag edges.
 *   4. On Edge Function failure (timeout, network, 5xx), fall back to
 *      defaults: title = url or first 120 chars of text, no tags,
 *      no thumbnail.
 */

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import {
  createNode,
  DuplicateNodeError,
  type NodeMetadata,
} from "@/lib/db/nodes";
import { extractNodeMetadata } from "@/lib/edge/extract-metadata";

export type CreateNodeResult =
  | { ok: true; nodeId: string }
  | { ok: false; error: string; code?: "duplicate" | "invalid" | "unknown" };

export interface CreateNodeInput {
  url?: string | null;
  textContent?: string | null;
  languageCode?: string | null;
  /** Pre-known title from the caller (e.g. YouTube Data API). Priority over Edge Function. */
  title?: string | null;
  /** Pre-known thumbnail URL from the caller. Downloaded + uploaded to Storage. */
  thumbnailUrl?: string | null;
}

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Download an image from a URL and upload it to the `thumbnails` bucket
 * in Supabase Storage. Returns the storage key or null on any failure.
 * Mirrors the Edge Function's downloadAndUploadThumbnail logic.
 */
async function downloadAndUploadThumbnail(
  imageUrl: string,
  userId: string
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    const res = await fetch(imageUrl, {
      signal: controller.signal,
      headers: { "User-Agent": "LIKED-Bot/1.0" },
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) return null;

    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 8 * 1024 * 1024) return null;

    const ext = (contentType.split("/")[1] ?? "jpg").split(";")[0] || "jpg";
    const key = `${userId}/${crypto.randomUUID()}.${ext}`;

    const supabase = getSupabaseServiceClient();
    const { error } = await supabase.storage
      .from("thumbnails")
      .upload(key, buf, { contentType, upsert: false });

    if (error) return null;
    return key;
  } catch {
    return null;
  }
}

export async function createNodeAction(
  input: CreateNodeInput
): Promise<CreateNodeResult> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) {
    return { ok: false, error: "Not authenticated", code: "invalid" };
  }

  const url = input.url?.trim() || null;
  const text = input.textContent?.trim() || null;
  if (!url && !text) {
    return { ok: false, error: "Please enter a URL or text.", code: "invalid" };
  }
  if (url && !isValidUrl(url)) {
    return { ok: false, error: "Invalid URL.", code: "invalid" };
  }

  // Resolve user's preferred language — fall back to 'en' for now since the
  // profile language preference isn't exposed in the user row yet.
  const userLang = (input.languageCode ?? "en").slice(0, 8);

  // 2. Invoke Edge Function (never throws — returns undefined on failure).
  const edgeMetadata: NodeMetadata | undefined = await extractNodeMetadata({
    url,
    textContent: text,
    languageCode: userLang,
    accessToken: session?.access_token ?? null,
  });

  // 2b. Merge caller-provided metadata with Edge Function results.
  // Caller-provided title takes priority (e.g. YouTube Data API title).
  // Caller-provided thumbnailUrl is downloaded + uploaded to Storage.
  const callerTitle = input.title?.trim() || null;
  const callerThumbnailUrl = input.thumbnailUrl?.trim() || null;

  let callerThumbnailKey: string | null = null;
  if (callerThumbnailUrl) {
    callerThumbnailKey = await downloadAndUploadThumbnail(
      callerThumbnailUrl,
      user.id
    );
  }

  const metadata: NodeMetadata = {
    title: callerTitle ?? edgeMetadata?.title ?? null,
    thumbnailKey: callerThumbnailKey ?? edgeMetadata?.thumbnailKey ?? null,
    languageCode: edgeMetadata?.languageCode ?? userLang,
    suggestedTags: edgeMetadata?.suggestedTags ?? [],
    description: edgeMetadata?.description ?? null,
  };

  // 3. Persist — single transaction via RPC.
  try {
    const node = await createNode(
      user.id,
      { url: url ?? undefined, textContent: text ?? undefined },
      metadata
    );
    revalidatePath("/feed");
    return { ok: true, nodeId: node.id };
  } catch (err) {
    if (err instanceof DuplicateNodeError) {
      return {
        ok: false,
        error: "This URL already exists in your feed.",
        code: "duplicate",
      };
    }
    const message = err instanceof Error ? err.message : "Failed to create node.";
    return { ok: false, error: message, code: "unknown" };
  }
}

// @ts-nocheck — Deno Edge Function, not part of Node tsc project
// Storage upload utility — extracted from extract-node-metadata/index.ts
import type { SupabaseClient } from "./_types.ts";

const FETCH_TIMEOUT_MS = 8000;
const THUMBNAILS_BUCKET = "thumbnails";

/** Defensive fetch: AbortController-backed timeout, safe on any failure. */
async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "LIKED-Bot/1.0", Accept: "text/html,*/*" },
      signal: ctrl.signal,
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function downloadAndUploadThumbnail(
  supabase: SupabaseClient,
  imageUrl: string,
  userId: string
): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(imageUrl, FETCH_TIMEOUT_MS);
    if (!res || !res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "application/octet-stream";
    if (!contentType.startsWith("image/")) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 8 * 1024 * 1024) return null; // 8MB cap
    const ext = (contentType.split("/")[1] ?? "jpg").split(";")[0] || "jpg";
    const key = `${userId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(THUMBNAILS_BUCKET)
      .upload(key, buf, { contentType, upsert: false });
    if (error) return null;
    return key;
  } catch {
    return null;
  }
}

export { fetchWithTimeout };

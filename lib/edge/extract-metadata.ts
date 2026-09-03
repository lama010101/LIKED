/**
 * Shared helper for invoking the `extract-node-metadata` Edge Function.
 *
 * Used by both:
 *   - `app/lib/actions/createNode.ts` (cookie-based server action)
 *   - `app/api/import/route.ts` (bearer-token API route for the Chrome extension)
 *
 * The Edge Function is deployed with `--no-verify-jwt` and verifies the JWT
 * itself. It accepts `{ url, text_content, user_language_code }` and returns
 * `{ title, thumbnail_key?, language_code, suggested_tags[], ... }`.
 *
 * This helper NEVER throws — on any failure (timeout, network, 5xx, parse
 * error) it returns `undefined` so the caller falls back to defaults
 * (title = url, no thumbnail, no tags). This matches PRD §15.1 #3.
 */

import type { NodeMetadata } from "@/lib/db/nodes";

const EDGE_FUNCTION_NAME = "extract-node-metadata";
const EDGE_FUNCTION_TIMEOUT_MS = 10_000;

interface ExtractArgs {
  url: string | null;
  textContent?: string | null;
  languageCode: string;
  /** Bearer token for the Edge Function's rate-limit + activity_log. */
  accessToken?: string | null;
}

function edgeFunctionUrl(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  return `${base}/functions/v1/${EDGE_FUNCTION_NAME}`;
}

/**
 * Call the Edge Function via `fetch` with explicit headers.
 * Returns `NodeMetadata | undefined` (undefined on any failure).
 */
export async function extractNodeMetadata(
  args: ExtractArgs
): Promise<NodeMetadata | undefined> {
  const { url, textContent, languageCode, accessToken } = args;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EDGE_FUNCTION_TIMEOUT_MS);

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    };
    if (accessToken) {
      headers["authorization"] = `Bearer ${accessToken}`;
    }

    const res = await fetch(edgeFunctionUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        url,
        text_content: textContent ?? null,
        user_language_code: languageCode,
      }),
      signal: controller.signal,
    });

    if (!res.ok) return undefined;

    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!data || typeof data !== "object") return undefined;

    return {
      title: typeof data.title === "string" ? data.title : null,
      thumbnailKey:
        typeof data.thumbnail_key === "string" ? data.thumbnail_key : null,
      languageCode:
        typeof data.language_code === "string" ? data.language_code : languageCode,
      suggestedTags: Array.isArray(data.suggested_tags)
        ? (data.suggested_tags as unknown[]).filter(
            (t): t is string => typeof t === "string"
          )
        : [],
      description: typeof data.description === "string" ? data.description : null,
    };
  } catch {
    // Timeout, network, or parse error → fall back to defaults.
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

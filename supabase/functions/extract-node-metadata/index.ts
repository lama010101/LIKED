// Supabase Edge Function — extract-node-metadata (P8-T01, PRD §15.1)
//
// Accepts `{url?, text_content?, user_language_code}` and returns the
// metadata contract defined in PRD §15.1. All error paths return sensible
// defaults — the function NEVER throws to the caller.
//
// Side effects owned by this function (per PRD §15.1):
//   - Uploads discovered Open-Graph image to Storage bucket `thumbnails/`
//     and returns the resulting storage key.
//   - Inserts a row into `activity_log` with action='metadata_extraction'
//     for every invocation (success or failure).
//   - Enforces a soft rate limit of 30 calls per user per minute using
//     `activity_log` as the counter store (good-enough for v1).
//
// Deploy:
//   supabase functions deploy extract-node-metadata --no-verify-jwt
//
// Why --no-verify-jwt: the function verifies the JWT itself against
// Supabase Auth so it can still identify the caller user_id, but allows
// optional anonymous invocation paths used by tests.

// deno-lint-ignore-file no-explicit-any
// @ts-nocheck — this file runs in Deno on the Supabase Edge runtime,
// not in the Node project's TS compile. The host project's tsc should
// exclude `supabase/functions/**` (see tsconfig).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { jsonResponse, corsHeaders } from "./_cors.ts";
import { extractMeta } from "./_html.ts";
import { extractTagsFromUrl, tokenizeTextForTags, buildSuggestedTags } from "./_tags.ts";
import { downloadAndUploadThumbnail, fetchWithTimeout } from "./_storage.ts";
import { overRateLimit, logInvocation } from "./_rateLimit.ts";
import type { SupabaseClient } from "./_types.ts";

// ─────────────────────────── Types ───────────────────────────

interface RequestBody {
  url?: string | null;
  text_content?: string | null;
  user_language_code?: string;
}

interface MetadataResponse {
  title: string;
  description?: string;
  thumbnail_key?: string | null;
  language_code: string;
  suggested_tags: string[];
  og_data?: {
    og_title?: string;
    og_description?: string;
    og_image?: string;
    og_type?: string;
  };
}

// ─────────────────────── Constants / Config ───────────────────────

const FETCH_TIMEOUT_MS = 8000;

// ──────────────────────── Main handler ────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Function mis-configured" }, 500, req);
  }

  // Identify caller from Authorization header (bearer JWT from Supabase Auth)
  const authHeader = req.headers.get("Authorization") ?? "";
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await caller.auth.getUser();
  const userId = userData?.user?.id ?? null;

  // Service-role client for rate-limit read, storage upload, activity_log write
  const svc = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Parse input defensively — bad JSON produces defaults, never a 500.
  let body: RequestBody = {};
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    body = {};
  }
  const userLang = (body.user_language_code ?? "en").slice(0, 8);
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const textContent = typeof body.text_content === "string" ? body.text_content : "";

  // Rate limit (only when we know who the caller is)
  if (userId) {
    if (await overRateLimit(svc, userId)) {
      await logInvocation(svc, userId, { rate_limited: true, url_given: !!url });
      return jsonResponse(
        buildDefaults(url, textContent, userLang, "rate_limited"),
        429,
        req
      );
    }
  }

  // Dispatch
  let result: MetadataResponse;
  try {
    if (url) {
      result = await handleUrl(svc, url, userLang, userId);
    } else if (textContent) {
      result = handleText(textContent, userLang);
    } else {
      result = buildDefaults("", "", userLang, "empty_input");
    }
  } catch (e) {
    // PRD §15.1 #3: if any step fails, return sensible defaults.
    result = buildDefaults(url, textContent, userLang, "unexpected_error");
    console.error("extract-node-metadata unexpected error", e);
  }

  if (userId) {
    await logInvocation(svc, userId, {
      url: url || null,
      has_text: !!textContent,
      tag_count: result.suggested_tags.length,
      thumbnail: !!result.thumbnail_key,
    });
  }

  return jsonResponse(result, 200, req);
});

// ──────────────────────── Branch: URL ────────────────────────

async function handleUrl(
  svc: SupabaseClient,
  url: string,
  userLang: string,
  userId: string | null
): Promise<MetadataResponse> {
  const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
  if (!res || !res.ok) return buildDefaults(url, "", userLang, "fetch_failed");

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("html") && !contentType.includes("xml")) {
    return buildDefaults(url, "", userLang, "non_html");
  }

  const html = (await res.text()).slice(0, 500_000); // cap to 500KB
  const meta = extractMeta(html);

  const title =
    meta.ogTitle ?? meta.twitterTitle ?? meta.title ?? url;
  const description =
    meta.ogDescription ?? meta.twitterDescription ?? meta.description ?? undefined;

  // Thumbnail: prefer og:image, fall back to twitter:image.
  let thumbnail_key: string | null = null;
  const imageUrl = meta.ogImage ?? meta.twitterImage ?? null;
  if (imageUrl && userId) {
    const absolute = absolutizeUrl(imageUrl, url);
    if (absolute) {
      thumbnail_key = await downloadAndUploadThumbnail(svc, absolute, userId);
    }
  }

  // Language
  const language_code = (meta.ogLocale ?? meta.htmlLang ?? userLang)
    .slice(0, 8)
    .replace("_", "-");

  // Auto-tag candidates (PRD §15.1 #1c)
  const candidates: string[] = [];
  if (meta.ogType) candidates.push(meta.ogType.split(".")[0]);
  candidates.push(...meta.ogVideoTags);
  candidates.push(...meta.ogArticleTags);
  candidates.push(...extractTagsFromUrl(url));
  if (title) candidates.push(...tokenizeTextForTags(title));
  if (description) candidates.push(...tokenizeTextForTags(description));

  const suggested_tags = buildSuggestedTags(candidates, language_code);

  return {
    title: title.slice(0, 512),
    description: description?.slice(0, 2048),
    thumbnail_key,
    language_code,
    suggested_tags,
    og_data: {
      og_title: meta.ogTitle,
      og_description: meta.ogDescription,
      og_image: meta.ogImage,
      og_type: meta.ogType,
    },
  };
}

function absolutizeUrl(candidate: string, base: string): string | null {
  try {
    return new URL(candidate, base).toString();
  } catch {
    return null;
  }
}

// ──────────────────────── Branch: text-only ────────────────────────

function handleText(text: string, userLang: string): MetadataResponse {
  const trimmed = text.trim();
  const title = trimmed.slice(0, 120);
  const tokens = tokenizeTextForTags(trimmed);
  const suggested_tags = buildSuggestedTags(tokens, userLang);
  return {
    title,
    language_code: userLang,
    suggested_tags,
    thumbnail_key: null,
  };
}

// ──────────────────────── Default builders ────────────────────────

function buildDefaults(
  url: string,
  textContent: string,
  userLang: string,
  _reason: string
): MetadataResponse {
  const title = url
    ? url
    : textContent
      ? textContent.trim().slice(0, 120)
      : "Untitled";
  return {
    title,
    language_code: userLang,
    suggested_tags: [],
    thumbnail_key: null,
  };
}

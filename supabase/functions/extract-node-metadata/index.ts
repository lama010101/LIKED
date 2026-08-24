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
const MAX_TAGS = 8;
const RATE_LIMIT_PER_MIN = 30;
const THUMBNAILS_BUCKET = "thumbnails";
const USER_AGENT = "LIKED-Bot/1.0";

// This function is only ever invoked server-to-server (Next.js server
// action / API route via lib/edge/extract-metadata.ts) — never directly
// from a browser or the extension — so it does not need permissive CORS.
// These headers exist only so the OPTIONS/error paths return *something*;
// no origin is allowed to read the response cross-origin.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Minimal multilingual stop-word lists. Additional languages can be added
// without breaking callers — unknown language codes simply fall back to
// English-only filtering.
const STOP_WORDS: Record<string, string[]> = {
  en: [
    "the", "a", "an", "and", "or", "but", "if", "then", "else", "of", "on",
    "in", "at", "to", "for", "with", "by", "from", "as", "is", "are", "was",
    "were", "be", "been", "being", "it", "this", "that", "these", "those",
    "i", "you", "he", "she", "we", "they", "them", "us", "our", "your",
    "my", "his", "her", "its", "their", "what", "which", "who", "whom",
    "when", "where", "why", "how", "all", "any", "both", "each", "few",
    "more", "most", "other", "some", "such", "no", "not", "only", "own",
    "same", "so", "than", "too", "very", "can", "will", "just", "about",
    "one", "two", "three", "into", "via", "com", "www", "http", "https",
  ],
  fr: ["le", "la", "les", "de", "des", "un", "une", "et", "ou", "mais", "que", "qui", "dans", "pour", "avec", "sur", "par", "en", "au", "aux", "est", "sont"],
  es: ["el", "la", "los", "las", "de", "un", "una", "y", "o", "pero", "que", "en", "para", "con", "por", "es", "son"],
  de: ["der", "die", "das", "den", "dem", "des", "und", "oder", "aber", "ein", "eine", "in", "für", "mit", "auf", "von", "zu", "ist", "sind"],
  pt: ["o", "a", "os", "as", "de", "um", "uma", "e", "ou", "mas", "que", "em", "para", "com", "por", "é", "são"],
  it: ["il", "la", "lo", "i", "gli", "le", "di", "un", "una", "e", "o", "ma", "che", "in", "per", "con", "su", "è", "sono"],
  ja: ["の", "に", "は", "を", "が", "と", "で", "も", "から", "まで"],
  zh: ["的", "了", "在", "是", "和", "与", "也", "或", "而"],
  th: ["และ", "หรือ", "แต่", "ของ", "ใน", "ที่", "เป็น", "ได้"],
};

// ──────────────────────── Utilities ────────────────────────

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function normalizeToken(raw: string): string {
  return raw.normalize("NFKC").toLowerCase().trim();
}

function stopWordsFor(languageCode: string): Set<string> {
  const lang = languageCode.toLowerCase().split("-")[0];
  const extra = STOP_WORDS[lang] ?? [];
  return new Set([...STOP_WORDS.en, ...extra]);
}

/** Defensive fetch: AbortController-backed timeout, safe on any failure. */
async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,*/*" },
      signal: ctrl.signal,
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ──────────────────────── HTML parsing ────────────────────────
//
// Regex-based OG/meta extraction — no heavy DOM dependency. Covers the
// shapes we care about per PRD §15.1 (og:*, twitter:*, <title>, <meta>).

function extractMeta(html: string): {
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  ogLocale?: string;
  ogVideoTags: string[];
  ogArticleTags: string[];
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  title?: string;
  description?: string;
  htmlLang?: string;
} {
  const out: ReturnType<typeof extractMeta> = {
    ogVideoTags: [],
    ogArticleTags: [],
  };

  // <title>…</title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) out.title = decodeHtmlEntities(titleMatch[1].trim());

  // <html lang="xx">
  const htmlLang = html.match(/<html[^>]*\slang=["']([^"']+)["']/i);
  if (htmlLang) out.htmlLang = htmlLang[1];

  // <meta property="og:foo" content="…">  and  <meta name="…" content="…">
  const metaRe =
    /<meta\s+(?:[^>]*?(?:property|name)=["']([^"']+)["'])[^>]*?content=["']([^"']*)["'][^>]*\/?>/gi;
  const metaRe2 =
    /<meta\s+(?:[^>]*?content=["']([^"']*)["'])[^>]*?(?:property|name)=["']([^"']+)["'][^>]*\/?>/gi;

  const addMeta = (key: string, rawValue: string) => {
    const value = decodeHtmlEntities(rawValue);
    const k = key.toLowerCase();
    switch (k) {
      case "og:title":
        out.ogTitle = value;
        break;
      case "og:description":
        out.ogDescription = value;
        break;
      case "og:image":
      case "og:image:url":
      case "og:image:secure_url":
        if (!out.ogImage) out.ogImage = value;
        break;
      case "og:type":
        out.ogType = value;
        break;
      case "og:locale":
        out.ogLocale = value;
        break;
      case "og:video:tag":
        out.ogVideoTags.push(value);
        break;
      case "og:article:tag":
      case "article:tag":
        out.ogArticleTags.push(value);
        break;
      case "twitter:title":
        out.twitterTitle = value;
        break;
      case "twitter:description":
        out.twitterDescription = value;
        break;
      case "twitter:image":
      case "twitter:image:src":
        out.twitterImage = value;
        break;
      case "description":
        out.description = value;
        break;
    }
  };

  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html)) !== null) addMeta(m[1], m[2]);
  while ((m = metaRe2.exec(html)) !== null) addMeta(m[2], m[1]);

  return out;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

// ──────────────────────── Tag extraction ────────────────────────

function extractTagsFromUrl(urlStr: string): string[] {
  try {
    const u = new URL(urlStr);
    const out: string[] = [];
    // Domain-derived hint
    const host = u.hostname.replace(/^www\./, "").split(".")[0];
    if (host) out.push(host);
    // Known shortcuts
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      out.push("video", "youtube");
    }
    if (u.hostname.includes("spotify.com")) out.push("music", "spotify");
    if (u.hostname.includes("suno.com") || u.hostname.includes("suno.ai")) {
      out.push("music", "suno");
    }
    if (u.hostname.includes("soundcloud.com")) out.push("music", "soundcloud");
    if (u.hostname.includes("vimeo.com")) out.push("video", "vimeo");
    if (u.hostname.includes("github.com")) out.push("code", "github");
    if (u.hostname.includes("medium.com")) out.push("article", "medium");
    if (u.hostname.includes("twitter.com") || u.hostname.includes("x.com")) {
      out.push("post", "twitter");
    }
    // Path segments
    for (const seg of u.pathname.split("/")) {
      if (/^[a-z0-9-]{3,32}$/i.test(seg) && !/^\d+$/.test(seg)) {
        out.push(seg.replace(/-/g, " "));
      }
    }
    return out;
  } catch {
    return [];
  }
}

function tokenizeTextForTags(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .split(/[\s,;:!?.\-_/\\|()\[\]{}"'`]+/u)
    .filter((t) => t.length >= 3 && t.length <= 24);
}

function buildSuggestedTags(
  candidates: string[],
  languageCode: string,
  cap = MAX_TAGS
): string[] {
  const stops = stopWordsFor(languageCode);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of candidates) {
    if (!raw) continue;
    const n = normalizeToken(raw);
    if (!n || stops.has(n)) continue;
    if (seen.has(n)) continue;
    if (/^\d+$/.test(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= cap) break;
  }
  return out;
}

// ──────────────────────── Storage upload ────────────────────────

async function downloadAndUploadThumbnail(
  supabase: any,
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

// ──────────────────────── Rate limit ────────────────────────

async function overRateLimit(supabase: any, userId: string): Promise<boolean> {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count, error } = await supabase
    .from("activity_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action", "metadata_extraction")
    .gte("created_at", since);
  if (error) return false; // fail open — do not punish the caller for our logging bug
  return (count ?? 0) >= RATE_LIMIT_PER_MIN;
}

async function logInvocation(
  supabase: any,
  userId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  try {
    await supabase.from("activity_log").insert({
      user_id: userId,
      action: "metadata_extraction",
      target_id: null,
      target_type: "node",
      metadata,
    });
  } catch {
    // best-effort
  }
}

// ──────────────────────── Main handler ────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Function mis-configured" }, 500);
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
        429
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

  return jsonResponse(result);
});

// ──────────────────────── Branch: URL ────────────────────────

async function handleUrl(
  svc: any,
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

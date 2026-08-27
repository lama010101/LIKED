// @ts-nocheck — Deno Edge Function, not part of Node tsc project
// Tag extraction utilities — extracted from extract-node-metadata/index.ts

const MAX_TAGS = 8;

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

export function normalizeToken(raw: string): string {
  return raw.normalize("NFKC").toLowerCase().trim();
}

export function stopWordsFor(languageCode: string): Set<string> {
  const lang = languageCode.toLowerCase().split("-")[0];
  const extra = STOP_WORDS[lang] ?? [];
  return new Set([...STOP_WORDS.en, ...extra]);
}

export function extractTagsFromUrl(urlStr: string): string[] {
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

export function tokenizeTextForTags(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .split(/[\s,;:!?.\-_/\\|()\[\]{}"'`]+/u)
    .filter((t) => t.length >= 3 && t.length <= 24);
}

export function buildSuggestedTags(
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

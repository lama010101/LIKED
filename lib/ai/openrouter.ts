import { logger } from "@/lib/utils/logger";

/**
 * Minimal OpenRouter client for Phase B categorization (PRD §41.3.3).
 * Requires OPENROUTER_API_KEY in env — absent → callers must fail soft.
 *
 * Provider ruling (PHASE5-N4-PROVIDER-SWAP-001): OpenRouter free tier,
 * nvidia/nemotron-3-super-120b-a12b:free — selected from the live catalog
 * (only free shortlist model supporting structured_outputs → strongest
 * JSON contract). Fallback candidate: google/gemma-4-31b-it:free.
 * Free-tier constraint: ~20 req/min burst, ~50 req/day per account.
 */

const MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface CategorizationSuggestion {
  folderName: string | null;
  tagLabels: string[];
  reason: string;
}

export function isCategorizationConfigured(): boolean {
  return !!process.env.OPENROUTER_API_KEY;
}

const RESPONSE_SCHEMA = {
  type: "json_schema",
  json_schema: {
    name: "categorization_suggestion",
    strict: true,
    schema: {
      type: "object",
      properties: {
        folderName: { type: ["string", "null"] },
        tagLabels: { type: "array", items: { type: "string" }, maxItems: 3 },
        reason: { type: "string" },
      },
      required: ["folderName", "tagLabels", "reason"],
      additionalProperties: false,
    },
  },
} as const;

export async function suggestCategorization(input: {
  title: string;
  description: string | null;
  channelTitle: string | null;
  existingFolders: string[];
  existingTags: string[];
}): Promise<CategorizationSuggestion | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const prompt = [
    "You are organizing a user's saved YouTube videos inside a bookmarking app.",
    "Given one video and the user's existing folders and tags, suggest:",
    '  - "folderName": the single best existing folder, or a short new folder name if none fit, or null',
    '  - "tagLabels": up to 3 short topical tag labels (reuse existing tags when they fit)',
    '  - "reason": one short sentence explaining the suggestion',
    "Respond with JSON only.",
    "",
    `Video title: ${input.title}`,
    input.channelTitle ? `Channel: ${input.channelTitle}` : "",
    input.description ? `Description: ${input.description.slice(0, 500)}` : "",
    `Existing folders: ${input.existingFolders.join(", ") || "(none)"}`,
    `Existing tags: ${input.existingTags.join(", ") || "(none)"}`,
  ].join("\n");

  // PHASE5-N4-HARDEN-001: OpenRouter wraps upstream provider failures
  // (e.g. {"error":{"code":503,"error_type":"provider_overloaded"}}) in an
  // HTTP 200 body. Retry ANY failure shape — non-OK status, embedded
  // error, empty content, malformed JSON — up to 3 total attempts with
  // 1s/2s backoff. Capped: no unbounded retry, genuine failures still
  // return null after the cap.
  const MAX_ATTEMPTS = 3;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: "user", content: prompt }],
          response_format: RESPONSE_SCHEMA,
        }),
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = JSON.parse(body) as {
        choices?: { message?: { content?: string } }[];
        error?: { message?: string; code?: number; metadata?: { error_type?: string } };
      };
      if (data.error) {
        throw new Error(
          `embedded error ${data.error.code ?? "?"} ${data.error.metadata?.error_type ?? ""}: ${data.error.message ?? "unknown"}`
        );
      }
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("empty content");
      const parsed = JSON.parse(text) as Partial<CategorizationSuggestion>;
      return {
        folderName:
          typeof parsed.folderName === "string" && parsed.folderName.trim()
            ? parsed.folderName.trim().slice(0, 80)
            : null,
        tagLabels: Array.isArray(parsed.tagLabels)
          ? parsed.tagLabels
              .filter((t): t is string => typeof t === "string" && !!t.trim())
              .map((t) => t.trim().slice(0, 40))
              .slice(0, 3)
          : [],
        reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : "",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < MAX_ATTEMPTS) {
        logger.warn(`[openrouter] attempt ${attempt}/${MAX_ATTEMPTS} failed (${msg}); retrying in ${attempt}s`);
        await sleep(attempt * 1000);
      } else {
        logger.warn(`[openrouter] suggestion failed after ${MAX_ATTEMPTS} attempts: ${msg}`);
        return null;
      }
    }
  }
  return null;
}

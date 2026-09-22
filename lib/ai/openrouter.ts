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
    if (!res.ok) {
      logger.warn("[openrouter] chat/completions non-OK:", res.status);
      return null;
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = data.choices?.[0]?.message?.content;
    if (!text) return null;
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
    logger.warn("[openrouter] suggestion failed:", err);
    return null;
  }
}

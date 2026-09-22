import { logger } from "@/lib/utils/logger";

/**
 * Minimal Gemini client for Phase B categorization (PRD §41.3.3).
 * Requires GEMINI_API_KEY in env — absent → callers must fail soft.
 */

const MODEL = "gemini-2.0-flash-lite";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

export interface CategorizationSuggestion {
  folderName: string | null;
  tagLabels: string[];
  reason: string;
}

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export async function suggestCategorization(input: {
  title: string;
  description: string | null;
  channelTitle: string | null;
  existingFolders: string[];
  existingTags: string[];
}): Promise<CategorizationSuggestion | null> {
  const apiKey = process.env.GEMINI_API_KEY;
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
    const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) {
      logger.warn("[gemini] generateContent non-OK:", res.status);
      return null;
    }
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
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
    logger.warn("[gemini] suggestion failed:", err);
    return null;
  }
}

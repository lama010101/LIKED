/**
 * Tag system database operations
 * P6-T01 — full implementation per PRD §19, §6.6, §33.4
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { Tag } from "@/lib/types/app";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export interface TagWithLabel extends Tag {
  label: string;
  language_code: string;
}

/**
 * 20-color tag palette per PRD §19 / §4.3. Cycled deterministically by
 * count of existing tag rows modulo palette length.
 */
export const TAG_COLOR_PALETTE: readonly string[] = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#f43f5e", // rose
  "#64748b", // slate
  "#78716c", // stone
  "#0f766e", // deep teal
] as const;

/**
 * Normalize a tag label per PRD §19.3: NFKC → lowercase → trim → collapse
 * internal whitespace. Deterministic across clients.
 */
export function normalizeTagLabel(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Pick the next palette color for a brand-new tag. Cycles deterministically
 * based on the current row count in `tags` (mod 20).
 */
async function pickNextColor(): Promise<string> {
  const supabase = getSupabaseServiceClient();
  const { count, error } = await supabase
    .from("tags")
    .select("id", { count: "exact", head: true });
  if (error) {
    throw new Error(`Failed to count tags: ${error.message}`);
  }
  const index = (count ?? 0) % TAG_COLOR_PALETTE.length;
  return TAG_COLOR_PALETTE[index];
}

/**
 * Deterministic tag creation / lookup per PRD §19.3:
 *   1. Normalize label
 *   2. Lookup `tag_translations` for (language_code, normalized label)
 *   3. If found → return existing tag_id
 *   4. If not found → INSERT new `tags` row with next palette color,
 *      INSERT `tag_translations` row, return new tag
 *
 * Same input (label, languageCode) always returns the same tag_id.
 */
export async function createOrGetTag(
  label: string,
  languageCode: string
): Promise<Tag> {
  const normalized = normalizeTagLabel(label);
  if (normalized.length === 0) {
    throw new Error("Tag label cannot be empty");
  }
  if (!languageCode || languageCode.trim().length === 0) {
    throw new Error("languageCode is required");
  }

  const supabase = getSupabaseServiceClient();

  // 1. Lookup existing translation
  const { data: existing, error: lookupErr } = await supabase
    .from("tag_translations")
    .select("tag_id, tags:tag_id (id, color_hex, created_at)")
    .eq("language_code", languageCode)
    .eq("label", normalized)
    .maybeSingle() as unknown as {
      data: { tag_id: string; tags: Tag | null } | null;
      error: { message: string } | null;
    };

  if (lookupErr) {
    throw new Error(`Failed to lookup tag: ${lookupErr.message}`);
  }

  if (existing?.tags) {
    return existing.tags;
  }

  // 2. Create new tag + translation atomically via RPC
  const color = await pickNextColor();

  const { data: newTagId, error: rpcErr } = await (supabase as AnySupabase).rpc(
    "create_tag_with_translation",
    {
      p_color: color,
      p_label: normalized,
      p_lang: languageCode,
    }
  ) as unknown as { data: string | null; error: { message: string } | null };

  if (rpcErr || !newTagId) {
    throw new Error(`Failed to create tag: ${rpcErr?.message ?? "unknown"}`);
  }

  // Fetch the full tag row to return
  const { data: newTag, error: fetchErr } = await supabase
    .from("tags")
    .select("id, color_hex, created_at")
    .eq("id", newTagId)
    .single() as unknown as { data: Tag | null; error: { message: string } | null };

  if (fetchErr || !newTag) {
    throw new Error(`Failed to fetch created tag: ${fetchErr?.message ?? "unknown"}`);
  }

  return newTag;
}

/**
 * Attach a tag to a node (organizational only — no edge/visibility effects,
 * per PRD §6.6). Idempotent: duplicate assignments are silently ignored.
 */
export async function addTagToNode(
  tagId: string,
  nodeId: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { data: existing, error: checkErr } = await supabase
    .from("tag_edges")
    .select("id")
    .eq("tag_id", tagId)
    .eq("node_id", nodeId)
    .maybeSingle();

  if (checkErr) {
    throw new Error(`Failed to check tag_edge: ${checkErr.message}`);
  }
  if (existing) return;

  const { error } = await supabase.from("tag_edges").insert({
    tag_id: tagId,
    node_id: nodeId,
    folder_id: null,
  });

  if (error) {
    throw new Error(`Failed to add tag to node: ${error.message}`);
  }
}

/**
 * Remove a tag from a node. No-op if not attached.
 */
export async function removeTagFromNode(
  tagId: string,
  nodeId: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase
    .from("tag_edges")
    .delete()
    .eq("tag_id", tagId)
    .eq("node_id", nodeId);

  if (error) {
    throw new Error(`Failed to remove tag from node: ${error.message}`);
  }
}

/**
 * Return all tags attached to a node, with labels resolved via PRD §33.4:
 *   1. user's `languageCode`
 *   2. fallback to `en`
 *   3. fallback to last 8 chars of tag_id
 */
export async function getTagsForNode(
  nodeId: string,
  languageCode: string
): Promise<TagWithLabel[]> {
  const supabase = getSupabaseServiceClient();

  type Row = {
    tag_id: string;
    tags: {
      id: string;
      color_hex: string;
      created_at: string;
      tag_translations: {
        language_code: string;
        label: string;
      }[];
    } | null;
  };

  const { data, error } = await supabase
    .from("tag_edges")
    .select(
      "tag_id, tags:tag_id (id, color_hex, created_at, tag_translations (language_code, label))"
    )
    .eq("node_id", nodeId) as unknown as {
      data: Row[] | null;
      error: { message: string } | null;
    };

  if (error) {
    throw new Error(`Failed to fetch tags for node: ${error.message}`);
  }

  return (data ?? [])
    .filter((r) => r.tags !== null)
    .map((r) => resolveTagLabel(r.tags!, languageCode));
}

/**
 * Return every tag in the system with its label resolved for `languageCode`
 * (fallback chain per PRD §33.4). Used by the tag filter chips and the Add
 * Card sheet.
 */
export async function getAllTags(
  languageCode: string
): Promise<TagWithLabel[]> {
  const supabase = getSupabaseServiceClient();

  type Row = {
    id: string;
    color_hex: string;
    created_at: string;
    tag_translations: {
      language_code: string;
      label: string;
    }[];
  };

  const { data, error } = await supabase
    .from("tags")
    .select(
      "id, color_hex, created_at, tag_translations (language_code, label)"
    )
    .order("created_at", { ascending: true }) as unknown as {
      data: Row[] | null;
      error: { message: string } | null;
    };

  if (error) {
    throw new Error(`Failed to fetch tags: ${error.message}`);
  }

  return (data ?? []).map((r) => resolveTagLabel(r, languageCode));
}

/**
 * Return tags visible to the current user per PRD §11.3f:
 *   Tags shown are only tags that exist on nodes currently visible to the current user
 *   (i.e., nodes reachable via edges WHERE user_id = current_user AND deleted_at IS NULL)
 * UX-001: Wire getVisibleTags RPC to TagsStrip
 */
export async function getVisibleTags(
  userId: string,
  languageCode: string
): Promise<TagWithLabel[]> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await (supabase as AnySupabase).rpc("get_visible_tags", {
    p_user_id: userId,
    p_language_code: languageCode,
  }) as unknown as {
    data: { id: string; color_hex: string; label: string }[] | null;
    error: { message: string } | null;
  };

  if (error) {
    throw new Error(`Failed to fetch visible tags: ${error.message}`);
  }

  return (data ?? []).map((t) => ({
    id: t.id,
    color_hex: t.color_hex,
    created_at: "", // Not returned by RPC, not needed for display
    label: t.label,
    language_code: languageCode,
  }));
}

/**
 * Apply the §33.4 deterministic fallback chain for a single tag.
 */
function resolveTagLabel(
  tag: {
    id: string;
    color_hex: string;
    created_at: string;
    tag_translations: { language_code: string; label: string }[];
  },
  languageCode: string
): TagWithLabel {
  const translations = tag.tag_translations ?? [];

  const exact = translations.find((t) => t.language_code === languageCode);
  if (exact) {
    return {
      id: tag.id,
      color_hex: tag.color_hex,
      created_at: tag.created_at,
      label: exact.label,
      language_code: exact.language_code,
    };
  }

  const english = translations.find((t) => t.language_code === "en");
  if (english) {
    return {
      id: tag.id,
      color_hex: tag.color_hex,
      created_at: tag.created_at,
      label: english.label,
      language_code: english.language_code,
    };
  }

  return {
    id: tag.id,
    color_hex: tag.color_hex,
    created_at: tag.created_at,
    label: tag.id.slice(-8),
    language_code: languageCode,
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { addTagToNode, createOrGetTag } from "@/lib/db/tags";
import { logger } from "@/lib/utils/logger";

/**
 * Phase B review-gate actions (PRD §41.3.3). Suggestions are created by
 * POST /api/categorize and only applied when the user accepts them here.
 * Folder/tag writes go through the existing RPC/helper path
 * (get_or_create_named_folder + add_node_to_folder / create_tag_with_translation
 * + tag_edges upsert) — no new write mechanism.
 */

export interface CategorizationSuggestionRow {
  id: string;
  node_id: string;
  node_title: string | null;
  node_thumbnail: string | null;
  suggested_folder_name: string | null;
  suggested_tag_labels: string[];
  reason: string | null;
}

async function requireUser() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function listCategorizationSuggestions(): Promise<CategorizationSuggestionRow[]> {
  const user = await requireUser();
  if (!user) return [];
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from("categorization_suggestions")
    .select("id, node_id, suggested_folder_name, suggested_tag_labels, reason, nodes:node_id (title, thumbnail_key)")
    .eq("user_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (error) {
    logger.error("[listCategorizationSuggestions] error:", error.message);
    return [];
  }
  type Row = {
    id: string;
    node_id: string;
    suggested_folder_name: string | null;
    suggested_tag_labels: string[] | null;
    reason: string | null;
    nodes: { title: string | null; thumbnail_key: string | null } | null;
  };
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    node_id: r.node_id,
    node_title: r.nodes?.title ?? null,
    node_thumbnail: r.nodes?.thumbnail_key ?? null,
    suggested_folder_name: r.suggested_folder_name,
    suggested_tag_labels: r.suggested_tag_labels ?? [],
    reason: r.reason,
  }));
}

export async function acceptCategorizationAction(
  suggestionId: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const db = getSupabaseServiceClient();
  const { data: suggestion, error: fetchErr } = await db
    .from("categorization_suggestions")
    .select("id, node_id, suggested_folder_name, suggested_tag_labels, status")
    .eq("id", suggestionId)
    .eq("user_id", user.id)
    .single();
  if (fetchErr || !suggestion) return { ok: false, error: "Suggestion not found" };
  if (suggestion.status !== "pending") return { ok: false, error: "Already reviewed" };

  try {
    // Folder write through the existing RPC path.
    const folderName = suggestion.suggested_folder_name?.trim();
    if (folderName) {
      const { data: folderId, error: folderErr } = await db.rpc(
        "get_or_create_named_folder",
        { p_user_id: user.id, p_name: folderName, p_color: null }
      );
      if (folderErr || !folderId) throw new Error(folderErr?.message ?? "folder create failed");
      const { error: edgeErr } = await db.rpc("add_node_to_folder", {
        p_node_id: suggestion.node_id,
        p_folder_id: folderId,
      });
      if (edgeErr) throw new Error(edgeErr.message);
    }

    // Tag writes through the existing helpers (create_tag_with_translation
    // RPC inside createOrGetTag + tag_edges upsert in addTagToNode).
    for (const label of suggestion.suggested_tag_labels ?? []) {
      const tag = await createOrGetTag(label, "en");
      await addTagToNode(tag.id, suggestion.node_id);
    }

    await db
      .from("categorization_suggestions")
      .update({ status: "accepted", reviewed_at: new Date().toISOString() })
      .eq("id", suggestionId);

    revalidatePath("/feed");
    revalidatePath("/youtube");
    return { ok: true };
  } catch (err) {
    logger.error("[acceptCategorizationAction] error:", err);
    return { ok: false, error: err instanceof Error ? err.message : "Apply failed" };
  }
}

export async function rejectCategorizationAction(
  suggestionId: string
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const db = getSupabaseServiceClient();
  const { error } = await db
    .from("categorization_suggestions")
    .update({ status: "rejected", reviewed_at: new Date().toISOString() })
    .eq("id", suggestionId)
    .eq("user_id", user.id)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/youtube");
  return { ok: true };
}

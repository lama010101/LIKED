import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { rpc } from "@/lib/db/rpc";
import { isCategorizationConfigured, suggestCategorization } from "@/lib/ai/openrouter";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/categorize — auto-organize proposal run (MVP2 Q2/Q16, F12).
 *
 * Creates an organize batch over the caller's YouTube system folder
 * (create_organize_batch snapshots the folder's own nodes as 'pending'
 * items), asks the LLM for a folder/tag proposal per item, and records
 * each via set_organize_item_proposal. Provider failures mark the item
 * 'failed' — both 'pending' leftovers and 'failed' items are re-included
 * by the next batch (Q2 re-run). Nothing is applied until the user
 * reviews the batch (apply_organization_batch, P2-08).
 *
 * Auth: session user; all writes go through SECURITY DEFINER RPCs.
 */
export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isCategorizationConfigured()) {
    return NextResponse.json(
      { error: "Categorization is not configured (OPENROUTER_API_KEY missing)" },
      { status: 503 }
    );
  }

  try {
    // 1. Source folder = caller-chosen folder, else the YouTube system folder.
    const body = await req.json().catch(() => ({}));
    const sourceFolderId = typeof body?.source_folder_id === "string" && body.source_folder_id
      ? body.source_folder_id
      : await rpc<string>("get_or_create_system_folder", { p_kind: "youtube", p_user_id: user.id });

    // 2. Snapshot candidates into a batch.
    const batchId = await rpc<string>("create_organize_batch", {
      p_source_folder_id: sourceFolderId,
    });

    const { data: items } = await supabase
      .from("organize_items")
      .select("id, node_id")
      .eq("batch_id", batchId)
      .eq("status", "pending");
    if (!items?.length) {
      return NextResponse.json({ created: 0, candidates: 0, batch_id: batchId });
    }

    // 3. Node metadata for prompts + vocabulary for the LLM.
    const nodeIds = items.map((i) => i.node_id);
    const { data: nodes } = await supabase
      .from("nodes")
      .select("id, title, language_code")
      .in("id", nodeIds);
    const nodeById = new Map((nodes ?? []).map((n) => [n.id, n]));

    const { data: transRows } = await supabase
      .from("translations")
      .select("node_id, language_code, description")
      .in("node_id", nodeIds);
    const descByNode = new Map<string, string>();
    for (const n of nodes ?? []) {
      const rows = (transRows ?? []).filter((t) => t.node_id === n.id);
      const own = rows.find((t) => t.language_code === n.language_code) ?? rows[0];
      if (own?.description) descByNode.set(n.id, own.description);
    }

    const folders = await rpc<{ name: string }[]>("get_user_folders", {
      p_user_id: user.id,
    }).catch(() => [] as { name: string }[]);
    const folderNames = (folders ?? []).map((f) => f.name);

    const { data: tagRows } = await supabase
      .from("tag_translations")
      .select("label")
      .eq("language_code", "en")
      .limit(60);
    const tagLabels = (tagRows ?? []).map((t) => t.label);

    // 4. One proposal per item; failures are marked and left for re-run.
    let created = 0;
    for (const item of items) {
      const node = nodeById.get(item.node_id);
      if (!node) continue;
      const suggestion = await suggestCategorization({
        title: node.title ?? "Untitled video",
        description: descByNode.get(item.node_id) ?? null,
        channelTitle: null,
        existingFolders: folderNames,
        existingTags: tagLabels,
      }).catch(() => null);
      await rpc("set_organize_item_proposal", {
        p_batch_id: batchId,
        p_node_id: item.node_id,
        p_target_folder_id: null,
        p_new_folder_name: suggestion?.folderName ?? null,
        p_tag_labels: suggestion?.tagLabels ?? [],
        p_reason: suggestion?.reason ?? null,
        p_status: suggestion ? "proposed" : "failed",
      }).catch((e) => logger.error("[categorize] proposal failed:", e));
      if (suggestion) created += 1;
    }

    return NextResponse.json({
      created,
      candidates: items.length,
      batch_id: batchId,
    });
  } catch (err) {
    logger.error("[categorize] failed:", err);
    return NextResponse.json(
      { error: "Categorization failed" },
      { status: 500 }
    );
  }
}

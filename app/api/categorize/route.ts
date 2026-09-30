import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { rpc } from "@/lib/db/rpc";
import { isCategorizationConfigured, suggestCategorization } from "@/lib/ai/openrouter";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/categorize — auto-organize proposal run (MVP2 Q2/Q16, F12).
 *
 * The client creates the batch first (create_organize_batch RPC snapshots
 * the folder's own nodes as 'pending' items) and passes its id here — so
 * the UI can poll per-item progress and cancel mid-run by discarding the
 * batch (the loop below re-checks the batch row before every proposal).
 * Each item gets an LLM folder/tag proposal recorded via
 * set_organize_item_proposal. Provider failures mark the item 'failed' —
 * both 'pending' leftovers and 'failed' items are re-included by the next
 * batch (Q2 re-run). Nothing is applied until the user reviews the batch
 * (apply_organization_batch, P2-08).
 *
 * Auth: session user; all writes go through SECURITY DEFINER RPCs.
 */
export const maxDuration = 60;

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
    // 1. Caller-created batch (progress polling + cancel live client-side).
    const body = await req.json().catch(() => ({}));
    const batchId = typeof body?.batch_id === "string" && body.batch_id ? body.batch_id : null;
    if (!batchId) {
      return NextResponse.json({ error: "batch_id required" }, { status: 400 });
    }

    const { data: batch } = await supabase
      .from("organize_batches")
      .select("id")
      .eq("id", batchId)
      .eq("user_id", user.id)
      .eq("status", "open")
      .maybeSingle();
    if (!batch) {
      return NextResponse.json({ error: "batch not found or not open" }, { status: 404 });
    }

    const { data: items } = await supabase
      .from("organize_items")
      .select("id, node_id")
      .eq("batch_id", batch.id)
      .eq("status", "pending");
    if (!items?.length) {
      return NextResponse.json({ created: 0, candidates: 0, batch_id: batch.id });
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
    //    Cancel: the client discards the batch row — detected here before
    //    each item so the loop stops instead of writing orphan proposals.
    let created = 0;
    for (const item of items) {
      const { data: alive } = await supabase
        .from("organize_batches")
        .select("id")
        .eq("id", batch.id)
        .eq("status", "open")
        .maybeSingle();
      if (!alive) {
        return NextResponse.json({
          cancelled: true, created, candidates: items.length, batch_id: batch.id,
        });
      }
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

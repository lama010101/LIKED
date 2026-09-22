import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { rpc } from "@/lib/db/rpc";
import { isGeminiConfigured, suggestCategorization } from "@/lib/ai/gemini";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/categorize — Phase B on-demand categorization (PRD §41.3.3).
 *
 * Runs Gemini over the user's YouTube-imported ("liked") videos that have
 * no suggestion yet and writes review-gated rows into
 * categorization_suggestions (status='pending'). Nothing touches
 * folders/tags until the user accepts a suggestion.
 *
 * Scope: likes-only — node_type='video' nodes carrying the 'YouTube' tag.
 * Auth: authenticated user only; suggestions are owner-scoped.
 */
const BATCH_LIMIT = 10;

export async function POST() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: "Categorization is not configured (GEMINI_API_KEY missing)" },
      { status: 503 }
    );
  }

  const db = getSupabaseServiceClient();
  try {
    // 1. "Liked" discriminator: tag_edges → a tag whose label is 'YouTube'.
    const { data: ytTagRows, error: ytErr } = await db
      .from("tag_translations")
      .select("tag_id")
      .eq("label", "YouTube");
    if (ytErr) throw ytErr;
    const ytTagIds = (ytTagRows ?? []).map((r) => r.tag_id);
    if (ytTagIds.length === 0) {
      return NextResponse.json({ created: 0, candidates: 0 });
    }

    // 2. Nodes already suggested (any status — don't re-suggest).
    const { data: existing } = await db
      .from("categorization_suggestions")
      .select("node_id")
      .eq("user_id", user.id);
    const doneIds = (existing ?? []).map((r) => r.node_id);

    // 3. Candidate liked videos.
    let query = db
      .from("nodes")
      .select("id, title, language_code, tag_edges!inner(tag_id)")
      .eq("owner_id", user.id)
      .eq("node_type", "video")
      .is("deleted_at", null)
      .in("tag_edges.tag_id", ytTagIds)
      .limit(BATCH_LIMIT);
    if (doneIds.length > 0) {
      query = query.not("id", "in", `(${doneIds.join(",")})`);
    }
    const { data: candidates, error: candErr } = await query;
    if (candErr) throw candErr;
    if (!candidates?.length) {
      return NextResponse.json({ created: 0, candidates: 0 });
    }

    // 4. Vocabulary for the prompt: folder names + tag labels.
    const folders = await rpc<{ name: string }[]>("get_user_folders", {
      p_user_id: user.id,
    }).catch(() => [] as { name: string }[]);
    const folderNames = (folders ?? []).map((f) => f.name);

    const { data: tagRows } = await db
      .from("tag_translations")
      .select("label")
      .eq("language_code", "en")
      .limit(60);
    const tagLabels = (tagRows ?? []).map((t) => t.label);

    // 5. Descriptions live in translations (per node + language) — fetch
    //    once for the batch, preferring each node's own language.
    const nodeIds = candidates.map((n) => n.id);
    const { data: transRows } = await db
      .from("translations")
      .select("node_id, language_code, description")
      .in("node_id", nodeIds);
    const descByNode = new Map<string, string>();
    for (const n of candidates) {
      const rows = (transRows ?? []).filter((t) => t.node_id === n.id);
      const own = rows.find((t) => t.language_code === n.language_code) ?? rows[0];
      if (own?.description) descByNode.set(n.id, own.description);
    }

    let created = 0;
    for (const node of candidates) {
      const suggestion = await suggestCategorization({
        title: node.title ?? "Untitled video",
        description: descByNode.get(node.id) ?? null,
        channelTitle: null,
        existingFolders: folderNames,
        existingTags: tagLabels,
      });
      if (!suggestion) continue;
      const { error: insErr } = await db
        .from("categorization_suggestions")
        .insert({
          user_id: user.id,
          node_id: node.id,
          suggested_folder_name: suggestion.folderName,
          suggested_tag_labels: suggestion.tagLabels,
          reason: suggestion.reason,
        });
      if (insErr) {
        logger.error("[categorize] insert failed:", insErr.message);
      } else {
        created += 1;
      }
    }

    return NextResponse.json({
      created,
      candidates: candidates.length,
    });
  } catch (err) {
    logger.error("[categorize] failed:", err);
    return NextResponse.json(
      { error: "Categorization failed" },
      { status: 500 }
    );
  }
}

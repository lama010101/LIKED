import { getSupabaseServerClient } from "@/lib/supabase/server";
import { rpc } from "@/lib/db/rpc";
import { classifyThemesBatch, isCategorizationConfigured, type ThemeClassifyItem } from "@/lib/ai/openrouter";
import { logger } from "@/lib/utils/logger";

/**
 * Card classification pipeline for grouped search.
 *
 * Per (node, user) row in node_classifications:
 *   theme/subtheme — LLM (classifyThemesBatch, ~10 cards per call)
 *   channel_title  — YouTube oEmbed author_name when the card URL is a
 *                    YouTube video, otherwise the link hostname. Never LLM.
 *
 * Only the caller's OWN nodes are classified (owner_id = user). Nodes that
 * already have a theme are skipped; channel_title is filled independently
 * (a channel-only backfill doesn't need an LLM call). All writes go through
 * the set_node_classifications RPC.
 */

const YT_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"]);
const LLM_BATCH = 10;
const CLASSIFY_CAP = 50;

export interface ClassifyResult {
  candidates: number;
  themed: number;
  channeled: number;
}

function isYouTubeUrl(url: string): boolean {
  try {
    return YT_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Free, key-less channel lookup: https://www.youtube.com/oembed → author_name. */
async function fetchYouTubeChannel(url: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { author_name?: string };
    return data.author_name?.trim() || null;
  } catch {
    return null;
  }
}

export async function classifyNodesForUser(userId: string, nodeIds: string[]): Promise<ClassifyResult> {
  const result: ClassifyResult = { candidates: 0, themed: 0, channeled: 0 };
  const ids = Array.from(new Set(nodeIds)).slice(0, CLASSIFY_CAP);
  if (ids.length === 0) return result;

  const supabase = await getSupabaseServerClient();

  const { data: nodes } = await supabase
    .from("nodes")
    .select("id, title, url, language_code")
    .in("id", ids)
    .eq("owner_id", userId)
    .is("deleted_at", null);
  if (!nodes?.length) return result;
  result.candidates = nodes.length;

  const { data: existing } = await supabase
    .from("node_classifications")
    .select("node_id, theme, channel_title")
    .eq("owner_id", userId)
    .in("node_id", ids);
  const existingByNode = new Map((existing ?? []).map((r) => [r.node_id, r]));

  // ── channel_title (deterministic — no LLM) ───────────────────
  const channelItems: { node_id: string; channel_title: string }[] = [];
  for (const n of nodes) {
    if (existingByNode.get(n.id)?.channel_title) continue;
    if (!n.url) continue;
    if (isYouTubeUrl(n.url)) {
      const ch = await fetchYouTubeChannel(n.url);
      if (ch) channelItems.push({ node_id: n.id, channel_title: ch });
    } else {
      const host = hostnameOf(n.url);
      if (host) channelItems.push({ node_id: n.id, channel_title: host });
    }
  }
  if (channelItems.length > 0) {
    await rpc("set_node_classifications", { p_owner_id: userId, p_items: channelItems })
      .then(() => { result.channeled = channelItems.length; })
      .catch((e) => logger.error("[classify] channel write failed:", e));
  }

  // ── theme/subtheme (LLM) ─────────────────────────────────────
  const unThemed = nodes.filter((n) => !existingByNode.get(n.id)?.theme);
  if (unThemed.length === 0 || !isCategorizationConfigured()) return result;

  const nodeIds2 = unThemed.map((n) => n.id);
  const { data: transRows } = await supabase
    .from("translations")
    .select("node_id, language_code, description")
    .in("node_id", nodeIds2);
  const descByNode = new Map<string, string>();
  for (const n of unThemed) {
    const rows = (transRows ?? []).filter((t) => t.node_id === n.id);
    const own = rows.find((t) => t.language_code === n.language_code) ?? rows[0];
    if (own?.description) descByNode.set(n.id, own.description);
  }

  const { data: folderEdges } = await supabase
    .from("folder_edges")
    .select("node_id, folder_id")
    .in("node_id", nodeIds2);
  const folderIds = Array.from(new Set((folderEdges ?? []).map((r) => r.folder_id)));
  const folderNameById = new Map<string, string>();
  if (folderIds.length > 0) {
    const { data: folderRows } = await supabase
      .from("folders")
      .select("id, name")
      .in("id", folderIds);
    for (const f of folderRows ?? []) folderNameById.set(f.id, f.name);
  }
  const folderByNode = new Map<string, string>();
  for (const r of folderEdges ?? []) {
    const name = folderNameById.get(r.folder_id);
    if (name && !folderByNode.has(r.node_id)) folderByNode.set(r.node_id, name);
  }

  // Theme vocabulary: distinct existing labels the model should reuse.
  const { data: vocabRows } = await supabase
    .from("node_classifications")
    .select("theme")
    .eq("owner_id", userId)
    .not("theme", "is", null)
    .limit(60);
  const vocab = Array.from(new Set((vocabRows ?? []).map((r) => r.theme as string)));

  const channelByNode = new Map(channelItems.map((c) => [c.node_id, c.channel_title]));
  for (let i = 0; i < unThemed.length; i += LLM_BATCH) {
    const slice = unThemed.slice(i, i + LLM_BATCH);
    const items: ThemeClassifyItem[] = slice.map((n) => ({
      id: n.id,
      title: n.title ?? "Untitled",
      description: descByNode.get(n.id) ?? null,
      channelTitle:
        existingByNode.get(n.id)?.channel_title ?? channelByNode.get(n.id) ?? (n.url ? hostnameOf(n.url) : null),
      folderName: folderByNode.get(n.id) ?? null,
    }));
    const classified = await classifyThemesBatch(items, vocab).catch(() => null);
    if (!classified?.length) continue;
    for (const c of classified) {
      if (c.theme && !vocab.includes(c.theme)) vocab.push(c.theme);
    }
    const writes = classified.map((c) => ({ node_id: c.id, theme: c.theme, subtheme: c.subtheme }));
    await rpc("set_node_classifications", { p_owner_id: userId, p_items: writes })
      .then(() => { result.themed += writes.length; })
      .catch((e) => logger.error("[classify] theme write failed:", e));
  }

  return result;
}

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { classifyNodesForUser } from "@/lib/ai/classify";
import { isCategorizationConfigured } from "@/lib/ai/openrouter";
import { logger } from "@/lib/utils/logger";

/**
 * POST /api/classify — grouped-search classification (theme/subtheme/channel)
 * for the caller's own nodes. Body: { node_ids: string[] } (≤50).
 * Batches LLM calls internally (~10 cards/call); channel_title is filled
 * deterministically (YouTube oEmbed / hostname) with no LLM involved.
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

  try {
    const body = await req.json().catch(() => ({}));
    const nodeIds = Array.isArray(body?.node_ids)
      ? body.node_ids.filter((x: unknown): x is string => typeof x === "string")
      : [];
    if (nodeIds.length === 0) {
      return NextResponse.json({ error: "node_ids required" }, { status: 400 });
    }
    if (!isCategorizationConfigured()) {
      return NextResponse.json(
        { error: "Categorization is not configured (OPENROUTER_API_KEY missing)" },
        { status: 503 }
      );
    }

    const result = await classifyNodesForUser(user.id, nodeIds);
    return NextResponse.json(result);
  } catch (err) {
    logger.error("[classify] failed:", err);
    return NextResponse.json({ error: "Classification failed" }, { status: 500 });
  }
}

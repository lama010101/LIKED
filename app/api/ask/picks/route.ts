// GET /api/ask/picks — owner picks visible to an eligible recommending guest
// (PLAN-V2-002 §2.9, D35). Same guard ladder as the other /api/ask routes.
// The RPC returns item fields only; this route only chooses the viewer's
// localized display name and never exposes node/table identifiers.

import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { mapAskRpcError } from "@/lib/ask/errors";
import { readCookieHeader } from "@/lib/ask/guest";
import { negotiateLocale } from "@/lib/i18n/negotiate";
import { tmdbTagFor, isLanguageCode } from "@/lib/i18n/languages";
import { isTmdbTag } from "@/lib/tmdb/client";
import { hitIpBucket, rateLimited, requireGuestAsk } from "../_lib/guestRequest";

export const dynamic = "force-dynamic";

const TMDB_LANG_COOKIE = "LIKED_TMDB_LANG";

interface LooseRpc {
  (fn: string, params: Record<string, unknown>): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

function viewerTag(request: Request): string {
  const cookie = readCookieHeader(request.headers, TMDB_LANG_COOKIE);
  if (isTmdbTag(cookie)) return cookie;
  const accept = request.headers.get("accept-language");
  const locale = negotiateLocale(accept);
  const tag = tmdbTagFor(isLanguageCode(locale) ? locale : "en", accept);
  return isTmdbTag(tag) ? tag : "en-US";
}

function rec(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : null;
}
function str(v: unknown): string | null { return typeof v === "string" ? v : null; }
function num(v: unknown): number | null { return typeof v === "number" && Number.isFinite(v) ? v : null; }

export async function GET(request: Request): Promise<NextResponse> {
  const guest = await requireGuestAsk(request);
  if (!guest.ok) return guest.response;
  const { ctx } = guest;
  if (!(await hitIpBucket("ask_view", ctx))) return rateLimited("ask_view");

  const client = getSupabaseServiceClient();
  const { data, error } = await (client as unknown as { rpc: LooseRpc }).rpc("guest_get_picks", {
    p_ask_token: ctx.token,
    p_contributor_id: ctx.contributorId,
  });
  if (error) return mapAskRpcError(error);

  const tag = viewerTag(request);
  const items = (Array.isArray(data) ? data : []).map((raw) => {
    const row = rec(raw) ?? {};
    const localized = rec(row.localized_names) ?? {};
    return {
      kind: str(row.kind),
      external_id: str(row.external_id),
      source: str(row.source),
      name: str(localized[tag]) ?? str(localized["en-US"]) ?? str(row.name),
      release_year: num(row.release_year),
      poster_path: str(row.poster_path),
      thumb_url: str(row.thumb_url),
    };
  }).filter((row) => row.kind && row.external_id && row.name);
  return NextResponse.json({ items });
}

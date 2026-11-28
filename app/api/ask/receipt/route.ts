// GET /api/ask/receipt — the guest's own receipt (PLAN-V2-002 §2.4,
// P0-14). guest_get_receipt returns ONLY rows where
// contributor_id = the cookie's contributor and owner_id = the ask owner,
// so another contributor's data is not reachable from this route at all
// (PRD §13 item 10).

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
  (
    fn: string,
    params: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

function viewerTag(request: Request): string {
  const cookie = readCookieHeader(request.headers, TMDB_LANG_COOKIE);
  if (isTmdbTag(cookie)) return cookie;
  const accept = request.headers.get("accept-language");
  const tag = tmdbTagFor(isLanguageCode(negotiateLocale(accept)) ? negotiateLocale(accept) : "en", accept);
  return isTmdbTag(tag) ? tag : "en-US";
}

export async function GET(request: Request): Promise<NextResponse> {
  const guest = await requireGuestAsk(request);
  if (!guest.ok) return guest.response;
  const { ctx } = guest;

  if (!(await hitIpBucket("ask_view", ctx))) {
    return rateLimited("ask_view");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await (client as unknown as { rpc: LooseRpc }).rpc(
    "guest_get_receipt",
    {
      p_ask_token: ctx.token,
      p_contributor_id: ctx.contributorId,
      p_lang: viewerTag(request),
    }
  );
  if (error) return mapAskRpcError(error);

  return NextResponse.json({ items: Array.isArray(data) ? data : [] });
}

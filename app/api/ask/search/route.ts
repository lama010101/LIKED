// GET /api/ask/search — guest catalog search (PLAN-V2-002 §6.2, P0-11/P0-12).
//
// Auth ladder: cookie (HMAC, zero DB calls when forged) -> ask token
// (guest_get_ask) -> ask_search_c + ask_search_ip (§4.3). No CORS header
// is ever sent; the route is same-origin only.
//
// TMDB branch: /search/multi in the viewer's tag. The tag comes from the
// guest cookie LIKED_TMDB_LANG when valid, else Accept-Language through
// the single LANGUAGES config (§6.3) — never from IP (REPO-19).
//
// YouTube branch (§6.4, migration-147 contract): submit-only guarded
// search. query_key = sha256(normalized | lang | region); a cache hit
// costs zero upstream calls and zero budget units; a miss consumes
// yt_budget_consume, calls search.list once and yt_cache_puts with a
// TTL <= 12 h. Budget exhaustion answers {status:'busy'} and the TMDB
// branch keeps working. All DB access goes through the class-S RPCs on
// the service client (REPO-15/REPO-16).

import { NextResponse } from "next/server";
import { askErrorResponse } from "@/lib/ask/errors";
import { readCookieHeader } from "@/lib/ask/guest";
import { negotiateLocale } from "@/lib/i18n/negotiate";
import { tmdbTagFor } from "@/lib/i18n/languages";
import {
  isTmdbTag,
  searchMulti,
  TmdbError,
  tmdbConfigured,
  type TmdbSearchResult,
  type TmdbTag,
} from "@/lib/tmdb/client";
import {
  hitContributorBucket,
  hitIpBucket,
  rateLimited,
  requireGuestAsk,
} from "../_lib/guestRequest";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { searchYouTube } from "@/lib/youtube/searchCache";
import { youtubeConfigured } from "@/lib/youtube/serverKey";

export const dynamic = "force-dynamic";

const TMDB_LANG_COOKIE = "LIKED_TMDB_LANG";

function viewerTag(request: Request): TmdbTag {
  const cookie = readCookieHeader(request.headers, TMDB_LANG_COOKIE);
  if (isTmdbTag(cookie)) return cookie;
  const accept = request.headers.get("accept-language");
  const tag = tmdbTagFor(negotiateLocale(accept), accept);
  return isTmdbTag(tag) ? tag : "en-US";
}

export async function GET(request: Request): Promise<NextResponse> {
  const guest = await requireGuestAsk(request);
  if (!guest.ok) return guest.response;
  const { ctx } = guest;

  if (!(await hitContributorBucket("ask_search_c", ctx))) {
    return rateLimited("ask_search_c");
  }
  if (!(await hitIpBucket("ask_search_ip", ctx))) {
    return rateLimited("ask_search_ip");
  }

  const url = new URL(request.url);
  const src = (url.searchParams.get("src") ?? "tmdb").toLowerCase();
  const q = (url.searchParams.get("q") ?? "").trim();

  if (src === "youtube") {
    if (!youtubeConfigured()) {
      return askErrorResponse("ASK_UNAVAILABLE");
    }
    const outcome = await searchYouTube(q, {
      contributorId: ctx.contributorId,
      lang: viewerTag(request),
      client: getSupabaseServiceClient(),
    });
    if (outcome.status === "ok") {
      return NextResponse.json({
        youtube: { status: "ok", results: outcome.results },
      });
    }
    return NextResponse.json({ youtube: { status: "busy" } });
  }

  if (q.length < 2) {
    return NextResponse.json({ tmdb: [] as TmdbSearchResult[] });
  }
  if (!tmdbConfigured()) {
    return askErrorResponse("ASK_UNAVAILABLE");
  }

  try {
    const results = await searchMulti(q, viewerTag(request));
    return NextResponse.json({ tmdb: results });
  } catch (error) {
    if (error instanceof TmdbError) {
      // Upstream / auth failures are not the guest's fault and must never
      // leak provider detail — one generic fail-closed shape.
      return askErrorResponse("ASK_UNAVAILABLE");
    }
    return askErrorResponse("ASK_UNAVAILABLE");
  }
}

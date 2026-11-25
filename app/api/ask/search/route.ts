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
// YouTube branch: NOT SERVED in this PR. The guarded search needs the
// youtube_search_cache write, which has no class-S RPC (REPO-15 forbids
// direct table writes) — reported as a STOP finding; the UI falls back to
// the paste-a-link row. `src=youtube` therefore answers {status:'busy'},
// the same degradation shape §6.4 prescribes for an exhausted budget.

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

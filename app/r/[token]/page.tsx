// /r/[token] — guest landing (PLAN-V2-002 §2.12, §4.2, task P0-13).
//
// Server component. Calls guest_get_ask with the service client — no
// Supabase session is created and no sb-* cookie is ever set on this
// route. Unknown, disabled and regenerated tokens all end in the same
// notFound() body (T1: no oracle).
//
// Rate limits (§4.3): ask_view 120/10min/IP; ask_token_miss 20/h/IP is
// counted only on ASK_NOT_ACTIVE. When either is exhausted the page also
// renders the identical 404 body — the 429 status lives on /api/ask/*
// (proven by the route tests).

import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getAskSecrets } from "@/lib/ask/env";
import { clientIpFromHeaders, hashRlKey, rateLimitIpKey } from "@/lib/ask/clientIp";
import { RATE_LIMITS, rlHit } from "@/lib/ask/rateLimit";
import { fetchActiveAsk } from "@/app/api/ask/_lib/guestRequest";
import { negotiateLocale } from "@/lib/i18n/negotiate";
import { tmdbTagFor, isLanguageCode } from "@/lib/i18n/languages";
import { isTmdbTag } from "@/lib/tmdb/client";
import FriendFlow from "@/components/v2/friend/FriendFlow";
import type { FriendAsk } from "@/components/v2/friend/types";

export const dynamic = "force-dynamic";

export const metadata = {
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
};

interface LooseClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): {
        in(column: string, values: number[]): Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
}

async function genreNames(ids: number[], tag: string): Promise<string[]> {
  if (ids.length === 0) return [];
  const client = getSupabaseServiceClient() as unknown as LooseClient;
  const { data, error } = await client
    .from("tmdb_genres")
    .select("id, name")
    .eq("lang", tag)
    .in("id", ids);
  if (error || !Array.isArray(data)) return [];
  const names: string[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const name = (row as { name?: unknown }).name;
    if (typeof name === "string" && name.length > 0) names.push(name);
  }
  return names.slice(0, 5);
}

function viewerTag(acceptLanguage: string | null): string {
  const locale = negotiateLocale(acceptLanguage);
  const tag = tmdbTagFor(isLanguageCode(locale) ? locale : "en", acceptLanguage);
  return isTmdbTag(tag) ? tag : "en-US";
}

export default async function AskLandingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const secrets = getAskSecrets();
  if (!secrets) notFound();

  const headerStore = await headers();
  const ip = clientIpFromHeaders(headerStore);
  const ipKeyHash = hashRlKey("ip", rateLimitIpKey(ip), secrets.rateLimitPepper);

  const view = RATE_LIMITS.ask_view;
  if (!(await rlHit("ask_view", ipKeyHash, view.windowSeconds, view.limit))) {
    notFound();
  }

  const found = await fetchActiveAsk(token);
  if (!found.ok) {
    if (found.notActive) {
      const miss = RATE_LIMITS.ask_token_miss;
      await rlHit("ask_token_miss", ipKeyHash, miss.windowSeconds, miss.limit);
    }
    notFound();
  }

  const ask: FriendAsk = found.ask;
  const names = await genreNames(ask.liked_genres ?? [], viewerTag(headerStore.get("accept-language")));

  return <FriendFlow token={token} ask={ask} genreNames={names} />;
}

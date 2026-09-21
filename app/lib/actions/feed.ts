"use server";

/**
 * Server action: thin transport wrapper around the canonical getFeed()
 * (lib/db/feed.ts) for client-side cursor pagination.
 *
 * Restores the single-owner invariant (AUDIT-06 P1-1): lib/db/feed.ts is
 * the ONLY file that calls the get_feed RPC. Adds no logic — calls the
 * function, passes parameters, returns the result verbatim.
 */

import { getFeed } from "@/lib/db/feed";
import type { FeedParams, FeedResult } from "@/lib/types/feed";

export async function fetchFeedPageAction(
  params: FeedParams,
  isInitialLoad: boolean
): Promise<FeedResult> {
  return getFeed(params, isInitialLoad);
}

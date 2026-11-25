// POST /api/ask/delete-me — guest "Delete my data" (PLAN-V2-002 §2.10,
// P0-14). Cookie only: no ask token is consulted, so a guest can delete
// their data even from a dead link. delete_guest_data is one transaction
// (notifications, budget rows, outbox, contributors cascade) and is
// idempotent. The cookie is cleared on the way out.

import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { askErrorResponse, mapAskRpcError } from "@/lib/ask/errors";
import { GUEST_COOKIE_NAME, GUEST_COOKIE_OPTIONS } from "@/lib/ask/cookie";
import {
  hitContributorBucket,
  rateLimited,
  requireGuestCookie,
} from "../_lib/guestRequest";

export const dynamic = "force-dynamic";

interface LooseRpc {
  (
    fn: string,
    params: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

export async function POST(request: Request): Promise<NextResponse> {
  const guest = await requireGuestCookie(request);
  if (!guest.ok) return guest.response;
  const { ctx } = guest;

  if (!(await hitContributorBucket("ask_submit_c", ctx))) {
    return rateLimited("ask_submit_c");
  }

  const client = getSupabaseServiceClient();
  const { data, error } = await (client as unknown as { rpc: LooseRpc }).rpc(
    "delete_guest_data",
    { p_contributor_id: ctx.contributorId }
  );
  if (error) return mapAskRpcError(error);

  const deleted =
    !!data && typeof data === "object" && (data as { deleted?: unknown }).deleted === true;
  if (!deleted && !data) return askErrorResponse("ASK_UNAVAILABLE");

  const response = NextResponse.json({ deleted });
  response.cookies.set(GUEST_COOKIE_NAME, "", { ...GUEST_COOKIE_OPTIONS, maxAge: 0 });
  return response;
}

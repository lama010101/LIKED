// POST /api/ask/submit — the single guest write path (PLAN-V2-002 §2.3,
// P0-14). All validation, idempotency, the daily cap, the notification,
// the enrichment jobs and the email outbox row live in the class-S
// submit_recommendations RPC (one transaction, rollback on any failure).
// The route only: authenticates the cookie + token, applies the two
// submit buckets (§4.3), shape-checks the envelope and kicks enrichment
// inside after() without blocking the response.

import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { readAskJsonBody } from "@/lib/ask/guard";
import { askErrorResponse, mapAskRpcError } from "@/lib/ask/errors";
import { kickEnrichment } from "@/lib/enrich/kick";
import {
  hitContributorBucket,
  hitTokenBucket,
  rateLimited,
  requireGuestAsk,
} from "../_lib/guestRequest";

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const MAX_ITEMS = 20;

interface LooseRpc {
  (
    fn: string,
    params: Record<string, unknown>
  ): Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const guest = await requireGuestAsk(request);
  if (!guest.ok) return guest.response;
  const { ctx } = guest;

  if (!(await hitContributorBucket("ask_submit_c", ctx))) {
    return rateLimited("ask_submit_c");
  }
  if (!(await hitTokenBucket("ask_submit_token", ctx.token, ctx))) {
    return rateLimited("ask_submit_token");
  }

  const parsed = await readAskJsonBody(request);
  if (!parsed.ok) return parsed.response;
  const body = asRecord(parsed.body);
  if (!body) return askErrorResponse("BAD_REQUEST");

  const batchId = typeof body.client_batch_id === "string" ? body.client_batch_id : "";
  if (!UUID_RE.test(batchId)) return askErrorResponse("BAD_REQUEST");
  if (!Array.isArray(body.items)) return askErrorResponse("EMPTY_BATCH");
  if (body.items.length === 0) return askErrorResponse("EMPTY_BATCH");
  if (body.items.length > MAX_ITEMS) return askErrorResponse("TOO_MANY_ITEMS");

  const client = getSupabaseServiceClient();
  const { data, error } = await (client as unknown as { rpc: LooseRpc }).rpc(
    "submit_recommendations",
    {
      p_ask_token: ctx.token,
      p_contributor_id: ctx.contributorId,
      p_client_batch_id: batchId,
      p_items: body.items,
    }
  );
  if (error) return mapAskRpcError(error);

  const result = asRecord(data) ?? {};
  const accepted = typeof result.accepted === "number" ? result.accepted : body.items.length;
  // Fire-and-forget: after() runs once the response is sent; a kick
  // failure is logged inside and never surfaces to the guest.
  kickEnrichment();

  return NextResponse.json({
    submission_id: typeof result.submission_id === "string" ? result.submission_id : null,
    accepted,
    replayed: result.replayed === true,
    owner_display_name: typeof result.owner_display_name === "string" ? result.owner_display_name : "",
  });
}

import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseClientFromBearer,
  extensionCorsHeaders,
  unauthenticatedResponse,
  optionsResponse,
} from "@/lib/supabase/bearer";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/extension/status?url=<page-url> — saved-state check for the
 * Chrome extension popup.
 *
 * Returns { success: true, saved: boolean, nodeId: string | null } so the
 * popup can show "Already saved" on open without POSTing a duplicate.
 *
 * Semantics mirror the /api/import dedupe lookup: an ACTIVE node
 * (deleted_at IS NULL) with the exact same url owned by the caller.
 * A trashed node does not count — same as the import route's
 * alreadyExists response.
 */
function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
}

export async function GET(req: NextRequest) {
  const authed = await getSupabaseClientFromBearer(req);
  if (!authed) return unauthenticatedResponse(req);
  const { user } = authed;
  const cors = extensionCorsHeaders(req);

  const url = req.nextUrl.searchParams.get("url") ?? "";
  if (!isValidUrl(url)) {
    return NextResponse.json(
      { success: false, code: "invalid", message: "A valid http(s) url is required." },
      { status: 400, headers: cors }
    );
  }

  try {
    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from("nodes")
      .select("id")
      .eq("url", url)
      .eq("owner_id", user.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { success: false, code: "server", message: error.message },
        { status: 500, headers: cors }
      );
    }

    return NextResponse.json(
      { success: true, saved: !!data, nodeId: data?.id ?? null },
      { status: 200, headers: cors }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to check URL status.";
    return NextResponse.json(
      { success: false, code: "server", message },
      { status: 500, headers: cors }
    );
  }
}

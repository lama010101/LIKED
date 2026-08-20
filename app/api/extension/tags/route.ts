import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseClientFromBearer,
  extensionCorsHeaders,
  unauthenticatedResponse,
  optionsResponse,
} from "@/lib/supabase/bearer";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getVisibleTags } from "@/lib/db/tags";

/**
 * GET /api/extension/tags — tag picker data for the Chrome extension.
 *
 * Returns the authenticated user's visible tags in their preferred language:
 *   { id, label, colorHex }[]
 *
 * Reuses getVisibleTags(userId, languageCode) from lib/db/tags.ts, which
 * calls the get_visible_tags RPC. Language is resolved from the user row.
 */
export async function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
}

export async function GET(req: NextRequest) {
  const authed = await getSupabaseClientFromBearer(req);
  if (!authed) return unauthenticatedResponse(req);
  const { user } = authed;
  const cors = extensionCorsHeaders(req);

  let languageCode = "en";
  try {
    const db = getSupabaseServiceClient();
    const { data: userRow } = await db
      .from("users")
      .select("language_code")
      .eq("id", user.id)
      .single();
    if (userRow?.language_code) {
      languageCode = userRow.language_code.slice(0, 8);
    }
  } catch {
    // Fall back to 'en' — non-fatal.
  }

  try {
    const tags = await getVisibleTags(user.id, languageCode);
    const out = tags.map((t) => ({
      id: t.id,
      label: t.label,
      colorHex: t.color_hex,
    }));
    return NextResponse.json(out, { status: 200, headers: cors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load tags.";
    return NextResponse.json(
      { success: false, code: "server", message },
      { status: 500, headers: cors }
    );
  }
}

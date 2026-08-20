import { NextRequest, NextResponse } from "next/server";
import {
  getSupabaseClientFromBearer,
  extensionCorsHeaders,
  unauthenticatedResponse,
  optionsResponse,
} from "@/lib/supabase/bearer";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

/**
 * GET /api/extension/folders — folder picker data for the Chrome extension.
 *
 * Returns the authenticated user's non-deleted folders as a flat list:
 *   { id, name, parentFolderId, colorHex, isProject }[]
 *
 * Uses the service client (server-side) filtered by owner_id = user.id.
 * Cannot reuse lib/db/folders.ts getUserFolders() because that helper
 * derives the user from cookies via getSupabaseServerClient(); extension
 * requests have no cookie jar and authenticate via bearer token.
 */
export async function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
}

export async function GET(req: NextRequest) {
  const authed = await getSupabaseClientFromBearer(req);
  if (!authed) return unauthenticatedResponse(req);
  const { user } = authed;
  const cors = extensionCorsHeaders(req);

  try {
    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from("folders")
      .select("id, name, parent_folder_id, color_hex, is_project")
      .eq("owner_id", user.id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { success: false, code: "server", message: error.message },
        { status: 500, headers: cors }
      );
    }

    const folders = (data ?? []).map((f) => ({
      id: f.id as string,
      name: f.name as string,
      parentFolderId: (f as { parent_folder_id: string | null }).parent_folder_id,
      colorHex: (f as { color_hex: string }).color_hex,
      isProject: (f as { is_project: boolean }).is_project,
    }));

    return NextResponse.json(folders, { status: 200, headers: cors });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load folders.";
    return NextResponse.json(
      { success: false, code: "server", message },
      { status: 500, headers: cors }
    );
  }
}

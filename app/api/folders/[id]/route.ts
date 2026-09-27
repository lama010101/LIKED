import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { rpc } from "@/lib/db/rpc";

// Orchestration only: every write goes through a single RPC
// (rename_folder / set_folder_color / trash_folder). Authorization lives
// inside the RPCs (auth.uid()), not here.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: folderId } = await params;
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const color = typeof body.color_hex === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color_hex) ? body.color_hex : null;
    if (!name && !color) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    if (name) {
      const { error } = await supabase.rpc("rename_folder", { p_folder_id: folderId, p_name: name });
      if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    }
    if (color) {
      try {
        await rpc<void>("set_folder_color", { p_folder_id: folderId, p_color: color });
      } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 403 });
      }
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id: folderId } = await params;
    // MVP2: soft-delete via trash_folder (Q7 — trash is recoverable; the
    // folder lands in /trash, not permanently deleted).
    const { error } = await supabase.rpc("trash_folder", { p_folder_id: folderId });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

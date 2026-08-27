import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: folderId } = await params;
    const body = await request.json().catch(() => ({}));

    // Build update object from allowed fields
    const update: { name?: string; color_hex?: string } = {};
    if (typeof body.name === "string" && body.name.trim().length > 0) {
      update.name = body.name.trim();
    }
    if (typeof body.color_hex === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color_hex)) {
      update.color_hex = body.color_hex;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    // Verify ownership
    const { data: folder, error: fetchError } = await supabase
      .from("folders")
      .select("owner_id")
      .eq("id", folderId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    if (folder.owner_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error: updateError } = await supabase
      .from("folders")
      .update(update)
      .eq("id", folderId)
      .eq("owner_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: folderId } = await params;

    // Verify ownership before delete
    const { data: folder, error: fetchError } = await supabase
      .from("folders")
      .select("owner_id")
      .eq("id", folderId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }

    if (folder.owner_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Soft delete by setting deleted_at
    const { error: updateError } = await supabase
      .from("folders")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", folderId)
      .eq("owner_id", user.id);

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

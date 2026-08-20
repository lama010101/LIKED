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

    const { id: nodeId } = await params;

    // Verify ownership before delete
    const { data: node, error: fetchError } = await supabase
      .from("nodes")
      .select("owner_id")
      .eq("id", nodeId)
      .single();

    if (fetchError) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    if (node.owner_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Soft delete by setting deleted_at
    const { error: updateError } = await supabase
      .from("nodes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", nodeId)
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

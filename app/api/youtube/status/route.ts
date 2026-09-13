import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // New token columns are not in the generated Database type yet.
    const { data } = await supabase
      .from("youtube_connections")
      .select("google_account_email, connected_at, revoked_at, refresh_token")
      .eq("user_id", user.id)
      .single();
    const row = data as unknown as {
      google_account_email: string;
      connected_at: string;
      revoked_at: string | null;
      refresh_token: string | null;
    } | null;

    // A connection is only usable when it holds a stored refresh token.
    const hasToken = !!row?.refresh_token;
    if (!row || row.revoked_at || !hasToken) {
      return NextResponse.json({ connected: false });
    }

    return NextResponse.json({
      connected: true,
      email: row.google_account_email,
      connectedAt: row.connected_at,
      hasToken,
    });
  } catch (err) {
    return NextResponse.json(
      { connected: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}

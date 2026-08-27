import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ connected: false });
    }

    const { data } = await supabase
      .from("youtube_connections")
      .select("google_account_email, connected_at, revoked_at")
      .eq("user_id", user.id)
      .single();

    if (!data || data.revoked_at) {
      return NextResponse.json({ connected: false });
    }

    // Also check if the session has a provider_token
    const { data: { session } } = await supabase.auth.getSession();
    const hasToken = !!session?.provider_token;

    return NextResponse.json({
      connected: true,
      email: data.google_account_email,
      connectedAt: data.connected_at,
      hasToken,
    });
  } catch (err) {
    return NextResponse.json(
      { connected: false, error: (err as Error).message },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get the provider_token to revoke with Google
    const { data: { session } } = await supabase.auth.getSession();
    const providerToken = session?.provider_token;

    // Revoke the Google OAuth token (both local + Google-side)
    if (providerToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${providerToken}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      } catch {
        // Continue with local disconnect even if Google revoke fails
      }
    }

    // Mark as revoked locally
    await supabase
      .from("youtube_connections")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

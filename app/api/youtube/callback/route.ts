import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { backfillFriendInvites } from "@/lib/db/friends";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/youtube";

  if (!code) {
    return NextResponse.redirect(`${origin}/feed`);
  }

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(`${origin}/feed?youtube_error=${encodeURIComponent(error.message)}`);
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(`${origin}/login`);
    }

    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.provider_token) {
      return NextResponse.redirect(`${origin}/feed?youtube_error=no_provider_token`);
    }

    // Record the connection
    const googleEmail = user.user_metadata?.email ?? user.email ?? "unknown@gmail.com";

    // Backfill any pending friend invites for this user's email.
    if (user.email) {
      try {
        await backfillFriendInvites(user.id, user.email);
      } catch {
        // Non-fatal — invite backfill is a best-effort enhancement.
      }
    }

    await supabase.from("youtube_connections").upsert({
      user_id: user.id,
      google_account_email: googleEmail,
      connected_at: new Date().toISOString(),
      revoked_at: null,
    }, { onConflict: "user_id" });

    return NextResponse.redirect(`${origin}${next}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "YouTube connection failed";
    return NextResponse.redirect(`${origin}/feed?youtube_error=${encodeURIComponent(message)}`);
  }
}

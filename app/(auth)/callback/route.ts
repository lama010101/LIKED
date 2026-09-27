import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { persistYouTubeConnectionFromSession } from "@/lib/youtube/persist-connection";

// Profile creation and pending friend-invite backfill are owned by the
// ensure_user_profile trigger on auth.users (migration 112) — this route only
// exchanges the OAuth code for a session.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/feed";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      }
    );

    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Unified grant (PRD §41.2): the Google OAuth session carries
        // provider_token/provider_refresh_token for YouTube — persist them
        // so the YouTube connection exists from first login.
        const providerToken = sessionData?.session?.provider_token;
        if (providerToken) {
          await persistYouTubeConnectionFromSession({
            userId: user.id,
            email: user.email ?? null,
            providerToken,
            providerRefreshToken: sessionData?.session?.provider_refresh_token ?? null,
            scope: null,
          });
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}

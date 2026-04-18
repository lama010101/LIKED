import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function getEmailPrefix(email: string): string {
  return email.split("@")[0] || "user";
}

function normalizeDisplayName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .slice(0, 32);
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/feed";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Check if user profile exists, create if not (for OAuth signups)
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: existingUser } = await supabase
          .from("users")
          .select("id")
          .eq("id", user.id)
          .single();

        if (!existingUser) {
          // Create user profile for OAuth signup
          const displayName = user.user_metadata?.full_name ||
                             user.user_metadata?.name ||
                             getEmailPrefix(user.email || "user");
          const normalizedName = normalizeDisplayName(displayName);

          await supabase.from("users").insert({
            id: user.id,
            display_name: displayName,
            normalized_display_name: normalizedName,
            language_code: "en",
            avatar_key: null,
            avatar_change_count_today: 0,
          });
        }
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Return to login on error
  return NextResponse.redirect(`${origin}/login`);
}

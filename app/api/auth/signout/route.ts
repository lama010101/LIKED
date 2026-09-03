import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST() {
  try {
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

    // Verify caller is authenticated before signing out (AUDIT-06 P3-2).
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign out failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { backfillFriendInvites } from "@/lib/db/friends";

export async function signIn(
  email: string,
  password: string,
  redirectTo?: string | null
): Promise<{ error: string } | never> {
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

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  // Backfill any pending friend invites for this user's email.
  // Idempotent: only updates rows where to_user_id IS NULL.
  const { data: { user } } = await supabase.auth.getUser();
  if (user?.email) {
    try {
      await backfillFriendInvites(user.id, user.email);
    } catch {
      // Non-fatal — invite backfill is a best-effort enhancement.
    }
  }

  // Only allow relative paths to prevent open redirect attacks.
  // Must start with "/" but not "//" (protocol-relative URL).
  const safe = redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
    ? redirectTo
    : "/feed";
  redirect(safe);
}

export async function signOut() {
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

  await supabase.auth.signOut();
  redirect("/login");
}

"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getFriendBar, FriendBarEntry, getGroupBar, GroupBarEntry } from "@/lib/db/friends";

export interface SessionUser {
  id: string;
  display_name: string | null;
  avatar_key: string | null;
  language_code?: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
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
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const db = getSupabaseServiceClient();
  const { data } = await db
    .from("users")
    .select("id, display_name, avatar_key, language_code")
    .eq("id", user.id)
    .single();

  if (!data) return null;
  return data as SessionUser;
}

export async function getFriendBarAction(userId: string): Promise<FriendBarEntry[]> {
  return getFriendBar(userId);
}

export async function getGroupBarAction(userId: string): Promise<GroupBarEntry[]> {
  return getGroupBar(userId);
}

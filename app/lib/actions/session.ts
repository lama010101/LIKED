"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getFriendBar, FriendBarEntry, getGroupBar, GroupBarEntry } from "@/lib/db/friends";

export interface SessionUser {
  id: string;
  display_name: string | null;
  avatar_key: string | null;
  language_code?: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
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
  } catch {
    return null;
  }
}

export async function getFriendBarAction(): Promise<FriendBarEntry[]> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return [];
    return await getFriendBar(user.id);
  } catch {
    return [];
  }
}

export async function getGroupBarAction(): Promise<GroupBarEntry[]> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return [];
    return await getGroupBar(user.id);
  } catch {
    return [];
  }
}

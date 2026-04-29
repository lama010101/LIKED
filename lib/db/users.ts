/**
 * User database operations
 */

import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { User } from "@/lib/types/app";

export async function getUserById(userId: string): Promise<User | null> {
  const supabase = getSupabaseServiceClient();
  
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .single();
  
  if (error || !data) return null;
  return data as User;
}

export async function updateDisplayName(
  userId: string,
  newDisplayName: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();
  const trimmed = newDisplayName.trim();
  if (trimmed.length < 3 || trimmed.length > 32) {
    throw new Error("Username must be between 3 and 32 characters.");
  }
  const normalized = trimmed.normalize("NFKC").toLowerCase();

  const { data: current } = await supabase
    .from("users")
    .select("display_name, username_changed_at")
    .eq("id", userId)
    .single();

  if (current?.username_changed_at) {
    const elapsed = Date.now() - new Date(current.username_changed_at).getTime();
    if (elapsed < 24 * 60 * 60 * 1000) {
      throw new Error("You can only change your username once per 24 hours.");
    }
  }

  const { data: existing } = await supabase
    .from("users")
    .select("id")
    .eq("normalized_display_name", normalized)
    .neq("id", userId)
    .maybeSingle();

  if (existing) throw new Error("That username is already taken.");

  const { error } = await supabase
    .from("users")
    .update({
      display_name: trimmed,
      normalized_display_name: normalized,
      username_changed_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) throw new Error("Failed to update username.");

  await supabase.from("activity_log").insert({
    user_id: userId,
    action: "username_change",
    target_id: null,
    target_type: null,
    metadata: { old: current?.display_name ?? null, new: trimmed },
  });
}

export async function updateAvatar(
  userId: string,
  avatarKey: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { data: current } = await supabase
    .from("users")
    .select("avatar_change_count_today, avatar_last_reset_date")
    .eq("id", userId)
    .single();

  const todayStr = new Date().toISOString().slice(0, 10);
  const lastReset = current?.avatar_last_reset_date ?? null;
  const count = lastReset === todayStr ? (current?.avatar_change_count_today ?? 0) : 0;

  if (count >= 5) throw new Error("You can only change your avatar 5 times per day.");

  const { error } = await supabase
    .from("users")
    .update({
      avatar_key: avatarKey,
      avatar_change_count_today: count + 1,
      avatar_last_reset_date: todayStr,
    })
    .eq("id", userId);

  if (error) throw new Error("Failed to update avatar.");

  await supabase.from("activity_log").insert({
    user_id: userId,
    action: "avatar_change",
    target_id: null,
    target_type: null,
    metadata: { avatar_key: avatarKey },
  });
}

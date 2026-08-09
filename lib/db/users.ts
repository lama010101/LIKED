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

  const { data, error } = await supabase.rpc("update_display_name", {
    p_user_id: userId,
    p_display_name: trimmed,
  });

  if (error) throw new Error("Failed to update username.");
  if (data && data[0]?.error_code === "RATE_LIMITED") {
    throw new Error("You can only change your username once per 24 hours.");
  }
  if (data && data[0]?.error_code === "NAME_TAKEN") {
    throw new Error("That username is already taken.");
  }
}

export async function updateAvatar(
  userId: string,
  avatarKey: string
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.rpc("update_avatar_key", {
    p_user_id: userId,
    p_avatar_key: avatarKey,
  });

  if (error) throw new Error("Failed to update avatar.");
  if (data && data[0]?.error_code === "RATE_LIMITED") {
    throw new Error("You can only change your avatar 5 times per day.");
  }
}

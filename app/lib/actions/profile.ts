"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

// ── helpers ───────────────────────────────────────────────────────────────

async function getSessionUserId(): Promise<string> {
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
  if (!user) throw new Error("Unauthenticated");
  return user.id;
}

function normalizeUsername(raw: string): string {
  return raw.normalize("NFKC").toLowerCase().trim();
}

// ── updateUsername ─────────────────────────────────────────────────────────

export type UpdateUsernameResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateUsername(
  newDisplayName: string
): Promise<UpdateUsernameResult> {
  const trimmed = newDisplayName.trim();

  if (trimmed.length < 3 || trimmed.length > 32) {
    return { ok: false, error: "Username must be between 3 and 32 characters." };
  }

  const normalized = normalizeUsername(trimmed);

  let userId: string;
  try {
    userId = await getSessionUserId();
  } catch {
    return { ok: false, error: "Not authenticated." };
  }

  const db = getSupabaseServiceClient();

  const { data: current, error: fetchErr } = await db
    .from("users")
    .select("display_name, username_changed_at")
    .eq("id", userId)
    .single();

  if (fetchErr || !current) {
    return { ok: false, error: "Could not load your profile." };
  }

  if (current.username_changed_at) {
    const last = new Date(current.username_changed_at).getTime();
    const elapsed = Date.now() - last;
    if (elapsed < 24 * 60 * 60 * 1000) {
      return {
        ok: false,
        error: "You can only change your username once per 24 hours.",
      };
    }
  }

  const { data: existing } = await db
    .from("users")
    .select("id")
    .eq("normalized_display_name", normalized)
    .neq("id", userId)
    .maybeSingle();

  if (existing) {
    return { ok: false, error: "That username is already taken." };
  }

  const { error: updateErr } = await db
    .from("users")
    .update({
      display_name: trimmed,
      normalized_display_name: normalized,
      username_changed_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updateErr) {
    return { ok: false, error: "Failed to update username. Please try again." };
  }

  await db.from("activity_log").insert({
    user_id: userId,
    action: "username_change",
    target_id: null,
    target_type: null,
    metadata: { old: current.display_name, new: trimmed },
  });

  return { ok: true };
}

// ── uploadAvatar ───────────────────────────────────────────────────────────

export type UploadAvatarResult =
  | { ok: true; avatarKey: string }
  | { ok: false; error: string };

export async function uploadAvatar(
  formData: FormData
): Promise<UploadAvatarResult> {
  let userId: string;
  try {
    userId = await getSessionUserId();
  } catch {
    return { ok: false, error: "Not authenticated." };
  }

  const file = formData.get("avatar") as File | null;
  if (!file) return { ok: false, error: "No file provided." };

  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) {
    return { ok: false, error: "Only JPG, PNG and WebP images are allowed." };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "Image must be under 5 MB." };
  }

  const db = getSupabaseServiceClient();

  const { data: current, error: fetchErr } = await db
    .from("users")
    .select("avatar_change_count_today, avatar_last_reset_date")
    .eq("id", userId)
    .single();

  if (fetchErr || !current) {
    return { ok: false, error: "Could not load your profile." };
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const lastReset = current.avatar_last_reset_date ?? null;
  const count = lastReset === todayStr ? (current.avatar_change_count_today ?? 0) : 0;

  if (count >= 5) {
    return { ok: false, error: "You can only change your avatar 5 times per day." };
  }

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const avatarKey = `avatars/${userId}/${Date.now()}.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error: storageErr } = await db.storage
    .from("avatars")
    .upload(avatarKey, bytes, { contentType: file.type, upsert: false });

  if (storageErr) {
    return { ok: false, error: "Failed to upload image. Please try again." };
  }

  const { error: updateErr } = await db
    .from("users")
    .update({
      avatar_key: avatarKey,
      avatar_change_count_today: count + 1,
      avatar_last_reset_date: todayStr,
    })
    .eq("id", userId);

  if (updateErr) {
    await db.storage.from("avatars").remove([avatarKey]);
    return { ok: false, error: "Failed to save avatar. Please try again." };
  }

  await db.from("activity_log").insert({
    user_id: userId,
    action: "avatar_change",
    target_id: null,
    target_type: null,
    metadata: { avatar_key: avatarKey },
  });

  return { ok: true, avatarKey };
}

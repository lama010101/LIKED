"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { updateDisplayName, updateAvatar } from "@/lib/db/users";
import { rpc } from "@/lib/db/rpc";

// ── helpers ───────────────────────────────────────────────────────────────

async function getSessionAuthUser() {
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
  if (!user) throw new Error("Unauthenticated");
  return { supabase, user };
}

async function getSessionUserId(): Promise<string> {
  const { user } = await getSessionAuthUser();
  return user.id;
}

// ── updateUsername ─────────────────────────────────────────────────────────

export type UpdateUsernameResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updateUsername(
  newDisplayName: string
): Promise<UpdateUsernameResult> {
  let userId: string;
  try {
    userId = await getSessionUserId();
  } catch {
    return { ok: false, error: "Not authenticated." };
  }

  try {
    await updateDisplayName(userId, newDisplayName);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
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

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const avatarKey = `avatars/${userId}/${Date.now()}.${ext}`;
  const bytes = await file.arrayBuffer();

  const { createServerClient } = await import("@supabase/ssr");
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

  const { error: storageErr } = await supabase.storage
    .from("avatars")
    .upload(avatarKey, bytes, { contentType: file.type, upsert: false });

  if (storageErr) {
    return { ok: false, error: "Failed to upload image. Please try again." };
  }

  try {
    await updateAvatar(userId, avatarKey);
    return { ok: true, avatarKey };
  } catch (err) {
    await supabase.storage.from("avatars").remove([avatarKey]);
    return { ok: false, error: (err as Error).message };
  }
}

// ── syncGoogleAvatar ──────────────────────────────────────────────────────

export type SyncGoogleAvatarResult =
  | { ok: true; avatarKey: string | null; updated: boolean }
  | { ok: false };

/** Google-signin avatar sync (UX-GOOGLE-AVATAR-001): copies the provider
 *  avatar URL (user_metadata.avatar_url / picture, identities fallback) into
 *  users.avatar_key. Runs lazily on app load — fixes users created before
 *  the ensure_user_profile backfill existed and refreshes changed pics.
 *  Never overwrites an uploaded avatar (storage keys are non-http). */
export async function syncGoogleAvatar(): Promise<SyncGoogleAvatarResult> {
  let ctx;
  try {
    ctx = await getSessionAuthUser();
  } catch {
    return { ok: false };
  }
  const { supabase, user } = ctx;

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  let url = (meta.avatar_url ?? meta.picture) as string | undefined;
  if (!url) {
    const ids = (user.identities ?? []) as Array<{ provider?: string; identity_data?: Record<string, unknown> }>;
    const g = ids.find((i) => i.provider === "google") ?? ids[0];
    url = (g?.identity_data?.avatar_url ?? g?.identity_data?.picture) as string | undefined;
  }
  if (!url || !/^https?:\/\//.test(url)) return { ok: true, avatarKey: null, updated: false };

  const { data: row } = await supabase.from("users").select("avatar_key").eq("id", user.id).single();
  const current = (row?.avatar_key ?? null) as string | null;
  if (current === url) return { ok: true, avatarKey: current, updated: false };
  // Only a real manual upload ("avatars/…" storage keys written by
  // uploadAvatar) is protected — stale/legacy keys get the Google pic
  // (UX-BATCH-002; users sign in with Google and expect their pic).
  if (current && current.startsWith("avatars/")) return { ok: true, avatarKey: current, updated: false };

  try {
    await updateAvatar(user.id, url);
    return { ok: true, avatarKey: url, updated: true };
  } catch {
    return { ok: false };
  }
}

// ── updateLanguage ─────────────────────────────────────────────────────────

export type UpdateLanguageResult =
  | { ok: true }
  | { ok: false; error: string };

const SUPPORTED_LANGUAGES = ['en', 'fr', 'th'] as const;

export async function updateLanguage(
  languageCode: string
): Promise<UpdateLanguageResult> {
  try {
    await getSessionUserId();
  } catch {
    return { ok: false, error: "Not authenticated." };
  }

  const lang = languageCode.trim().toLowerCase();
  if (!SUPPORTED_LANGUAGES.includes(lang as typeof SUPPORTED_LANGUAGES[number])) {
    return { ok: false, error: `Unsupported language. Supported: ${SUPPORTED_LANGUAGES.join(', ')}` };
  }

  try {
    await rpc<void>('set_language', { p_language_code: lang });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

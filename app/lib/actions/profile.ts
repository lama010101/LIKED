"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { updateDisplayName, updateAvatar } from "@/lib/db/users";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

// ── updateLanguage ─────────────────────────────────────────────────────────

export type UpdateLanguageResult =
  | { ok: true }
  | { ok: false; error: string };

const SUPPORTED_LANGUAGES = ['en', 'fr', 'th'] as const;

export async function updateLanguage(
  languageCode: string
): Promise<UpdateLanguageResult> {
  let userId: string;
  try {
    userId = await getSessionUserId();
  } catch {
    return { ok: false, error: "Not authenticated." };
  }

  const lang = languageCode.trim().toLowerCase();
  if (!SUPPORTED_LANGUAGES.includes(lang as typeof SUPPORTED_LANGUAGES[number])) {
    return { ok: false, error: `Unsupported language. Supported: ${SUPPORTED_LANGUAGES.join(', ')}` };
  }

  try {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase
      .from('users')
      .update({ language_code: lang })
      .eq('id', userId);

    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

import { useState } from "react";
import { getAvatarColor, getAvatarInitials } from "@/lib/utils/avatar";

/** avatar_key holds either an internal storage key or — since migration 134
 *  — an absolute social-provider URL captured at signup. Pass http(s) through. */
export function avatarUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${key}`;
}

export default function Avatar({
  userId, avatarKey, name, size = 36, active,
}: {
  userId: string;
  avatarKey: string | null;
  name: string;
  size?: number;
  active?: boolean;
}) {
  const url = avatarUrl(avatarKey);
  // Track the URL that failed so a later avatarKey change re-renders the img.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  // 2-letter initials: name initials, else first 2 alphanumerics of the id
  // (was 1 letter — UX-BATCH-002). Broken image URLs fall back to initials.
  const initial = name
    ? getAvatarInitials(name)
    : (userId || "?").replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "??";
  return (
    <div
      className={`av ${active ? "av-active" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.42, background: getAvatarColor(userId || name || "?"), color: "#fff" }}
      title={name}
    >
      {url && url !== failedUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} width={size} height={size} onError={() => setFailedUrl(url)} />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}

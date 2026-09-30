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
  const initial = name ? getAvatarInitials(name) : (userId || "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div
      className={`av ${active ? "av-active" : ""}`}
      style={{ width: size, height: size, fontSize: size * 0.42, background: getAvatarColor(userId || name || "?"), color: "#fff" }}
      title={name}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={name} width={size} height={size} />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  );
}

// Shared client-side shapes for the friend flow (P0-13/P0-14).
// Mirrors GuestAsk in app/api/ask/_lib/guestRequest.ts — kept local so a
// client bundle never imports a server module.

export interface FriendAsk {
  ask_id: string;
  owner_display_name: string;
  owner_avatar_key: string | null;
  prompt: string | null;
  note: string | null;
  liked_genres: number[] | null;
  owner_has_visible_picks: boolean;
}

export interface TrayItem {
  /** items.id returned by /api/ask/resolve. */
  item_id: string;
  source: "tmdb" | "youtube";
  kind: "movie" | "series" | "video" | "channel";
  title: string;
  year: number | null;
  poster_path: string | null;
  thumb_url: string | null;
  /** null = untouched (never a score), 0 = a real zero score. */
  rating: number | null;
  platform: string;
  comment: string;
}

export interface ReceiptRow {
  item_id: string;
  kind: string;
  name: string | null;
  year: number | null;
  poster_path: string | null;
  thumb_url: string | null;
  rating: number | null;
  platform_text: string | null;
  comment: string | null;
  updated_at: string | null;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "";
  return (first + last).toUpperCase();
}

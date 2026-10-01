"use client";

/** Friends-only avatar rail: friends avatars + manage link.
 *  The fixed "Me" entry was removed (UX-ME-FILTER-001) — "my content"
 *  is reached via the bottom-bar / feed ?me=1 filter instead.
 *  UX-BATCH-004: `query` filters to matching names during search; the
 *  vertical panel layout uses top-rail-size (80px) disks with the name
 *  underneath (styled via .rail-item column rules in globals.css). */

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Avatar from "./Avatar";
import type { FriendBarEntry } from "@/lib/db/friends";

export default function FriendsRail({ friends, horizontal = false, onSelect, query }: {
  friends: FriendBarEntry[];
  horizontal?: boolean;
  /** Fired after a friend is picked — AppShell may use it (e.g. panel behavior). */
  onSelect?: () => void;
  /** Active search term — only matching friends render (UX-BATCH-004). */
  query?: string | null;
}) {
  const t = useTranslations();
  // Ring the friend whose feed filter is active (UX-AVATAR-SELECT-001).
  const friendActive = useSearchParams().get("friend");
  const q = (query ?? "").trim().toLowerCase();
  const visible = friends.filter((f) => f.user_id && (!q || (f.display_name ?? "").toLowerCase().includes(q)));
  return (
    <div className={`rail ${horizontal ? "rail-h" : ""}`}>
      {visible.map((f) => (
        <Link key={f.user_id} href={`/feed?friend=${f.user_id}`} className="rail-item" title={f.display_name ?? ""} onClick={() => onSelect?.()}>
          {/* Top strip avatars are 2× the left-panel size (UX-TOPRAIL-AVATAR-001);
              vertical panel items match that size (UX-BATCH-004). */}
          <Avatar userId={f.user_id!} avatarKey={f.avatar_key} name={f.display_name ?? "?"} size={80} active={friendActive === f.user_id} />
          <span className="rail-label">{f.display_name}</span>
        </Link>
      ))}
      <Link href="/friends" className="rail-item rail-manage" title={t("nav.friends")}>
        <span className="rail-plus">+</span>
        <span className="rail-label">{t("nav.friends")}</span>
      </Link>
    </div>
  );
}

"use client";

/** Friends-only avatar rail: friends avatars + manage link.
 *  The fixed "Me" entry was removed (UX-ME-FILTER-001) — "my content"
 *  is reached via the bottom-bar / feed ?me=1 filter instead. */

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import Avatar from "./Avatar";
import type { FriendBarEntry } from "@/lib/db/friends";

export default function FriendsRail({ friends, horizontal = false }: { friends: FriendBarEntry[]; horizontal?: boolean }) {
  const t = useTranslations();
  // Ring the friend whose feed filter is active (UX-AVATAR-SELECT-001).
  const friendActive = useSearchParams().get("friend");
  return (
    <div className={`rail ${horizontal ? "rail-h" : ""}`}>
      {friends
        .filter((f) => f.user_id)
        .map((f) => (
          <Link key={f.user_id} href={`/feed?friend=${f.user_id}`} className="rail-item" title={f.display_name ?? ""}>
            {/* Top strip avatars are 2× the left-panel size (UX-TOPRAIL-AVATAR-001) */}
            <Avatar userId={f.user_id!} avatarKey={f.avatar_key} name={f.display_name ?? "?"} size={horizontal ? 80 : 40} active={friendActive === f.user_id} />
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

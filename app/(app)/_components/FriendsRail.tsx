"use client";

/** Friends-only avatar rail (Q3/rail spec): fixed "Me" on top + friends. */

import { useTranslations } from "next-intl";
import Link from "next/link";
import Avatar from "./Avatar";
import type { SessionUser } from "@/app/lib/actions/session";
import type { FriendBarEntry } from "@/lib/db/friends";

export default function FriendsRail({ user, friends }: { user: SessionUser; friends: FriendBarEntry[] }) {
  const t = useTranslations();
  return (
    <div className="rail">
      <Link href="/feed?me=1" className="rail-item" title={t("nav.me")}>
        <Avatar userId={user.id} avatarKey={user.avatar_key} name={user.display_name ?? "Me"} size={40} />
        <span className="rail-label">{t("nav.me")}</span>
      </Link>
      {friends
        .filter((f) => f.user_id)
        .map((f) => (
          <Link key={f.user_id} href={`/feed?friend=${f.user_id}`} className="rail-item" title={f.display_name ?? ""}>
            <Avatar userId={f.user_id!} avatarKey={f.avatar_key} name={f.display_name ?? "?"} size={40} />
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

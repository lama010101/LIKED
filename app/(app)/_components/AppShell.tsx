"use client";

/**
 * MVP2 app shell (Phase 4): desktop header + friends rail + FAB;
 * mobile bottom bar (Home / Add / Me). All copy via next-intl (Q14).
 * DnD: cards drag onto folder rail chips / folder tiles (Phase 4 dnd).
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import Avatar, { avatarUrl } from "./Avatar";
import ThemeSync from "./ThemeSync";
import AddSheet from "./AddSheet";
import FriendsRail from "./FriendsRail";
import { toast } from "@/lib/store/toastStore";
import { useRealtime } from "@/lib/hooks/useRealtime";
import type { SessionUser } from "@/app/lib/actions/session";
import type { FriendBarEntry } from "@/lib/db/friends";
import { getFoldersAction, type Mvp2Folder } from "@/app/lib/actions/mvp2";

export default function AppShell({
  user, friends, initialUnread, children,
}: {
  user: SessionUser;
  friends: FriendBarEntry[];
  initialUnread: number;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const [unread, setUnread] = useState(initialUnread);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [folders, setFolders] = useState<Mvp2Folder[]>([]);

  const refreshFolders = useCallback(() => {
    getFoldersAction().then(setFolders).catch(() => {});
  }, []);
  useEffect(refreshFolders, [refreshFolders]);

  // Realtime: bump unread badge + refresh on incoming shares (P9).
  useRealtime({
    userId: user.id,
    onNewNotification: () => setUnread((n) => n + 1),
    onNewShare: () => router.refresh(),
    onRatingChange: () => {},
    onProfileChange: () => {},
    onNodeTitleChange: () => {},
  });

  const onSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = search.trim();
    router.push(q ? `/feed?q=${encodeURIComponent(q)}` : "/feed");
  };

  return (
    <div className="shell">
      <ThemeSync />

      {/* Desktop/tablet left rail — folders + friends */}
      <aside className="shell-rail">
        <Link href="/feed" className="shell-logo">LIKED</Link>
        <FriendsRail user={user} friends={friends} />
      </aside>

      <div className="shell-main">
        {/* Header: search + notifications + me */}
        <header className="shell-header">
          <form onSubmit={onSearchSubmit} className="shell-search" role="search">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("nav.searchPlaceholder")}
              aria-label={t("nav.searchPlaceholder")}
            />
          </form>
          <Link href="/notifications" className="icon-btn" aria-label={t("nav.notifications")}>
            <BellIcon />
            {unread > 0 && <span className="badge">{unread > 9 ? "9+" : unread}</span>}
          </Link>
          <Link href="/trash" className="icon-btn" aria-label={t("nav.trash")}>
            <TrashIcon />
          </Link>
          <Link href="/me" className="icon-btn" aria-label={t("nav.me")}>
            {avatarUrl(user.avatar_key) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl(user.avatar_key)!} alt="" width={32} height={32} style={{ borderRadius: "50%" }} />
            ) : (
              <Avatar userId={user.id} avatarKey={null} name={user.display_name ?? ""} size={32} />
            )}
          </Link>
        </header>

        <main className="shell-content">{children}</main>

        {/* Mobile bottom bar: Home / Add / Me */}
        <nav className="shell-bottom" aria-label={t("nav.home")}>
          <Link href="/feed" className={`bb-item ${pathname === "/feed" ? "bb-active" : ""}`}>
            <HomeIcon />
            <span>{t("nav.home")}</span>
          </Link>
          <button className="bb-item bb-add" onClick={() => setAddOpen(true)} aria-label={t("nav.add")}>
            <PlusIcon />
            <span>{t("nav.add")}</span>
          </button>
          <Link href="/me" className={`bb-item ${pathname === "/me" ? "bb-active" : ""}`}>
            <Avatar userId={user.id} avatarKey={user.avatar_key} name={user.display_name ?? ""} size={24} />
            <span>{t("nav.me")}</span>
          </Link>
        </nav>

        {/* FAB — desktop/tablet */}
        <button className="fab" onClick={() => setAddOpen(true)} aria-label={t("nav.add")}>
          <PlusIcon />
        </button>
      </div>

      <AddSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        folders={folders}
        onCreated={() => { refreshFolders(); router.refresh(); toast.success(t("add.added")); }}
      />
    </div>
  );
}

function PlusIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
}
function HomeIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>;
}
function BellIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
}
function TrashIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2m1 0-1 15H8L7 6" /></svg>;
}

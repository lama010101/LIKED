"use client";

/**
 * MVP2 app shell (Phase 4): desktop header + friends rail + FAB;
 * mobile bottom bar (Home / Add / Me). All copy via next-intl (Q14).
 * DnD: cards drag onto folder rail chips / folder tiles (Phase 4 dnd).
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Avatar from "./Avatar";
import ThemeSync from "./ThemeSync";
import AddSheet from "./AddSheet";
import FriendsRail from "./FriendsRail";
import FolderRail from "./FolderRail";
import { setRailOpen, syncPrefs, type LayoutPref } from "./prefs";
import YouTubeSyncButton from "./YouTubeSyncButton";
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
  const [addMode, setAddMode] = useState<"card" | "folder">("card");
  const [addContext, setAddContext] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const searchParams = useSearchParams();
  const meActive = pathname === "/feed" && searchParams.get("me") === "1";
  const [folders, setFolders] = useState<Mvp2Folder[]>([]);
  const [layout, setLayout] = useState<LayoutPref>("friends-left");
  const [railOpen, setRailOpenState] = useState(true);

  const refreshFolders = useCallback(() => {
    getFoldersAction().then(setFolders).catch(() => {});
  }, []);
  useEffect(refreshFolders, [refreshFolders]);

  // Apply persisted layout/rail prefs + stay in sync with changes from /me.
  useEffect(() => syncPrefs((l, o) => { setLayout(l); setRailOpenState(o); }), []);

  const openAdd = (mode: "card" | "folder") => {
    // Current folder context: /folders/[id] path or /feed?folder= filter.
    const folderPage = pathname.match(/^\/folders\/([^/]+)/)?.[1] ?? null;
    const folderFilter = new URLSearchParams(window.location.search).get("folder");
    setAddContext(folderPage ?? folderFilter);
    setAddMode(mode);
    setAddOpen(true);
  };

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

      {/* Left panel — friends or folders, per layout pref */}
      <aside className={`shell-rail ${layout === "friends-top" ? "rail-folders" : ""}`}>
        {layout === "friends-top" ? (
          <FolderRail folders={folders} onAdd={() => openAdd("folder")} onChanged={refreshFolders} />
        ) : (
          <FriendsRail friends={friends} />
        )}
      </aside>

      <div className="shell-main">
        {/* Header: panel toggle + search + notifications + me */}
        <header className="shell-header">
          <Link href="/feed" className="shell-logo-img" aria-label={t("nav.home")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="LIKED" width={26} height={26} />
          </Link>
          <button
            type="button"
            className="icon-btn"
            onClick={() => setRailOpen(!railOpen)}
            aria-label={t("nav.togglePanel")}
            aria-pressed={railOpen}
            title={t("nav.togglePanel")}
          >
            <PanelIcon />
          </button>
          <form onSubmit={onSearchSubmit} className="shell-search" role="search">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("nav.searchPlaceholder")}
              aria-label={t("nav.searchPlaceholder")}
            />
          </form>
          <YouTubeSyncButton />
          <Link href="/notifications" className="icon-btn" aria-label={t("nav.notifications")}>
            <BellIcon />
            {unread > 0 && <span className="badge">{unread > 9 ? "9+" : unread}</span>}
          </Link>
          <Link href="/organize" className="icon-btn" aria-label={t("nav.organize")}>
            <OrganizeIcon />
          </Link>
        </header>

        {/* Friends sliding rail on top — when layout pref moves folders to the left panel */}
        {layout === "friends-top" && (
          <div className="shell-toprail">
            <FriendsRail friends={friends} horizontal />
          </div>
        )}

        <main className="shell-content">{children}</main>

        {/* Mobile bottom bar: Home / Add / Me */}
        <nav className="shell-bottom" aria-label={t("nav.home")}>
          <Link href="/feed" className={`bb-item ${pathname === "/feed" ? "bb-active" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={56} height={56} className="bb-logo" />
            <span>{t("nav.home")}</span>
          </Link>
          <button className="bb-item bb-add" onClick={() => openAdd("card")} aria-label={t("nav.add")}>
            <PlusIcon />
            <span>{t("nav.add")}</span>
          </button>
          {/* Me = "my content" feed filter (/feed?me=1 → get_feed p_view:"mine").
              Toggles off back to /feed when already active (FolderRail pattern). */}
          <button
            type="button"
            className={`bb-item ${meActive ? "bb-active" : ""}`}
            onClick={() => router.push(meActive ? "/feed" : "/feed?me=1")}
            aria-pressed={meActive}
            aria-label={t("nav.me")}
          >
            <Avatar userId={user.id} avatarKey={user.avatar_key} name={user.display_name ?? ""} size={56} />
            <span>{t("nav.me")}</span>
          </button>
        </nav>

        {/* FAB — desktop/tablet */}
        <button className="fab" onClick={() => openAdd("card")} aria-label={t("nav.add")}>
          <PlusIcon />
        </button>
      </div>

      <AddSheet
        key={`${addMode}-${addContext ?? "root"}`}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        folders={folders}
        contextFolderId={addContext}
        initialMode={addMode}
        onCreated={() => { refreshFolders(); router.refresh(); toast.success(t("add.added")); }}
      />
    </div>
  );
}

function PanelIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>;
}
function PlusIcon() {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
}
function BellIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>;
}
function OrganizeIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>;
}

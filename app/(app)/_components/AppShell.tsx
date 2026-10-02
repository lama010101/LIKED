"use client";

/**
 * MVP2 app shell (Phase 4): desktop header + friends rail + FAB;
 * mobile bottom bar (Home / Add / Me). All copy via next-intl (Q14).
 * DnD: cards drag onto folder rail chips / folder tiles (Phase 4 dnd).
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Avatar from "./Avatar";
import ThemeSync from "./ThemeSync";
import AddSheet from "./AddSheet";
import FriendsRail from "./FriendsRail";
import FolderRail from "./FolderRail";
import Modal from "./Modal";
import { setLayoutPref, setRailOpen, syncPrefs, type LayoutPref } from "./prefs";
import { syncGoogleAvatar } from "@/app/lib/actions/profile";
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
  const friendId = searchParams.get("friend");
  const [folders, setFolders] = useState<Mvp2Folder[]>([]);
  // Friend filter active → left-panel rail lists only folders that friend
  // shared with me (get_folders p_friend_id). `folders` stays the full set
  // for AddSheet pickers.
  const [railFolders, setRailFolders] = useState<Mvp2Folder[]>([]);
  const [layout, setLayout] = useState<LayoutPref>("friends-left");
  const [railOpen, setRailOpenState] = useState(true);
  const [switchOpen, setSwitchOpen] = useState(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Desktop panel width — drag-resizable (UX-BATCH-004), persisted in
  // localStorage. Applied as a CSS var; mobile (≤700px) always uses 50vw.
  const subscribePrefs = useCallback((onChange: () => void) => {
    window.addEventListener("liked:prefs", onChange);
    return () => window.removeEventListener("liked:prefs", onChange);
  }, []);
  const railW = useSyncExternalStore(
    subscribePrefs,
    () => { const w = parseInt(localStorage.getItem("liked.railW") ?? "", 10); return w >= 180 && w <= 480 ? w : null; },
    () => null
  );
  const setRailW = (v: number | ((p: number | null) => number | null)) => {
    const w = typeof v === "function" ? v(parseInt(localStorage.getItem("liked.railW") ?? "", 10) || null) : v;
    if (w == null) localStorage.removeItem("liked.railW");
    else localStorage.setItem("liked.railW", String(w));
    window.dispatchEvent(new Event("liked:prefs"));
  };
  const onResizeStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => setRailW(Math.min(480, Math.max(180, ev.clientX)));
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      setRailW((w) => { if (w) localStorage.setItem("liked.railW", String(w)); return w; });
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const refreshFolders = useCallback(() => {
    getFoldersAction().then(setFolders).catch(() => {});
    if (friendId) getFoldersAction({ friendId }).then(setRailFolders).catch(() => {});
  }, [friendId]);
  useEffect(refreshFolders, [refreshFolders]);

  // Apply persisted layout/rail prefs + stay in sync with changes from /me.
  useEffect(() => syncPrefs((l, o) => { setLayout(l); setRailOpenState(o); }), []);

  // Lazy Google-avatar sync (UX-GOOGLE-AVATAR-001): fills avatar_key from the
  // provider pic when missing/outdated, then refreshes so the pic renders.
  useEffect(() => {
    syncGoogleAvatar().then((r) => { if (r.ok && r.updated) router.refresh(); }).catch(() => {});
  }, [router]);

  // Rail-toggle click/dblclick handlers shared by the header button
  // (desktop) and its mobile home in the bottom bar (UX-BB-LAYOUT-001).
  const onRailToggleClick = (e: React.MouseEvent) => {
    if (e.detail === 0) { setRailOpen(!railOpen); return; }
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      setRailOpen(!railOpen);
    }, 250);
  };
  const onRailToggleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
    setSwitchOpen(true);
  };

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

      <div className="shell-main">
        {/* Header spans the full width above the panel (UX-BATCH-004) —
            it stays put whether the left panel is open or closed. */}
        <header className="shell-header">
          {/* Panel toggle (replaces the old separate toggle button):
              single click opens/closes the left panel (250ms disambiguation,
              same as FolderRail); double-click opens the view switcher.
              Icon + label name the rail the panel currently shows — FOLDERS
              when layout pref is friends-top (FolderRail in panel), FRIENDS
              otherwise (FriendsRail in panel). */}
          <button
            type="button"
            className="shell-logo-img rail-toggle"
            onClick={onRailToggleClick}
            onDoubleClick={onRailToggleDoubleClick}
            aria-label={layout === "friends-top" ? t("nav.folders") : t("nav.friends")}
            aria-pressed={railOpen}
            title={t("nav.togglePanel")}
          >
            {layout === "friends-top" ? <FolderGlyph /> : <FriendsGlyph />}
            <span className="rail-toggle-label">
              {layout === "friends-top" ? t("nav.folders") : t("nav.friends")}
            </span>
          </button>
          <form onSubmit={onSearchSubmit} className="shell-search" role="search">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("nav.searchPlaceholder")}
              aria-label={t("nav.searchPlaceholder")}
            />
            <button type="submit" className="search-go" aria-label={t("nav.search")} title={t("nav.search")}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            </button>
          </form>
          <Link href="/notifications" className="icon-btn" aria-label={t("nav.notifications")}>
            <BellIcon />
            {unread > 0 && <span className="badge">{unread > 9 ? "9+" : unread}</span>}
          </Link>
          <Link href="/organize" className="icon-btn" aria-label={t("nav.organize")}>
            <OrganizeIcon />
          </Link>
          <Link href="/me" className="icon-btn" aria-label={t("nav.settings")} title={t("nav.settings")}>
            <GearIcon />
          </Link>
        </header>
        {/* Panel-view switcher — rendered AFTER </header>, not inside it:
            .shell-header is sticky z-30, so a modal rendered inside it is
            trapped under .shell-bottom (z-40) on mobile and its menu items
            can't be clicked (found in e2e). Rendered inside .shell-main,
            which creates no stacking context. */}
        <Modal open={switchOpen} onClose={() => setSwitchOpen(false)} title={t("nav.panelView")}>
          <div className="menu-list">
            <button
              type="button"
              className="menu-item"
              onClick={() => { setSwitchOpen(false); setLayoutPref("friends-top"); }}
            >
              <FolderGlyph /> {t("nav.folders")}
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => { setSwitchOpen(false); setLayoutPref("friends-left"); }}
            >
              <FriendsGlyph /> {t("nav.friends")}
            </button>
          </div>
        </Modal>

        {/* Left panel — friends or folders, per layout pref.
            Staying OPEN on selection per latest spec (was: auto-close).
            width var drives desktop drag-resize; mobile = 50vw. */}
        <div className="shell-body">
          <aside
            className={`shell-rail ${layout === "friends-top" ? "rail-folders" : ""}`}
            style={railW ? ({ "--rail-w": `${railW}px` } as React.CSSProperties) : undefined}
          >
            {layout === "friends-top" ? (
              <FolderRail folders={friendId ? railFolders : folders} onAdd={() => openAdd("folder")} onChanged={refreshFolders} />
            ) : (
              <FriendsRail friends={friends} query={searchParams.get("q")} />
            )}
          </aside>
          <div className="rail-resizer" role="separator" aria-orientation="vertical" onPointerDown={onResizeStart} />

          <div className="shell-inner">
            {/* Friends sliding rail on top — when layout pref moves folders to the left panel */}
            {layout === "friends-top" && (
              <div className="shell-toprail">
                <FriendsRail friends={friends} horizontal query={searchParams.get("q")} />
              </div>
            )}

            <main className="shell-content">{children}</main>
          </div>
        </div>

        {/* Mobile bottom bar: panel toggle (the desktop header button's
            mobile home — UX-BB-LAYOUT-001) / Add / Me */}
        <nav className="shell-bottom" aria-label={t("nav.home")}>
          <button
            type="button"
            className={`bb-item rail-toggle-bb ${railOpen ? "bb-active" : ""}`}
            onClick={onRailToggleClick}
            onDoubleClick={onRailToggleDoubleClick}
            aria-label={layout === "friends-top" ? t("nav.folders") : t("nav.friends")}
            aria-pressed={railOpen}
          >
            {layout === "friends-top" ? <FolderGlyph /> : <FriendsGlyph />}
            <span>{layout === "friends-top" ? t("nav.folders") : t("nav.friends")}</span>
          </button>
          <button type="button" className="bb-item bb-add" onClick={() => openAdd("card")} aria-label={t("nav.add")}>
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
            <Avatar userId={user.id} avatarKey={user.avatar_key} name={user.display_name ?? ""} size={56} active={meActive} />
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

function FolderGlyph() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" /></svg>;
}
function FriendsGlyph() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.1 2.9-5 5.5-5s4.9 1.9 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M15.8 14.3c2.7.2 4.4 1.9 4.9 4.7" /></svg>;
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
function GearIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>;
}

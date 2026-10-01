"use client";

/** Folders rail — left-panel variant of the folder section (folders-top ↔
 *  friends-top layout pref). Click filters /feed?folder=id (toggles off when
 *  active), Enter/double-click enters /folders/[id]; items are drop targets
 *  for card drags (same as FolderTile). */

import { useCallback, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  moveNodeToFolderAction, moveFolderAction, renameFolderAction,
  shareFolderV2Action, trashFolderAction, type Mvp2Folder,
} from "@/app/lib/actions/mvp2";
import { getFriendBarAction, getGroupBarAction } from "@/app/lib/actions/session";
import { toast } from "@/lib/store/toastStore";
import ItemMenu from "./ItemMenu";
import FolderPickModal from "./FolderPickModal";
import ShareSheet from "./ShareSheet";

const CLICK_DELAY_MS = 250;
const THUMB_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/`;

function coverKey(f: Mvp2Folder): string | null {
  const thumbs = (f.thumbnails as { th: string }[] | string[] | null) ?? [];
  const keys = thumbs.map((x) => (typeof x === "string" ? x : x.th)).filter(Boolean);
  return keys[0] ?? null;
}

export default function FolderRail({ folders, onAdd, onChanged, onSelect }: {
  folders: Mvp2Folder[];
  onAdd: () => void;
  onChanged?: () => void;
  /** Fired after a folder is picked (filter or enter) — AppShell closes the panel (UX-BATCH-001). */
  onSelect?: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  // ⋯ menu modals (UX-BATCH-003) — same action set as FolderTile.
  const [menuFolder, setMenuFolder] = useState<Mvp2Folder | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);

  const run = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
      onChanged?.();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  const menuActions = (f: Mvp2Folder) => {
    const isAdmin = f.my_permission === "admin" && !f.system_kind;
    const canShare = ["admin", "reshare"].includes(f.my_permission);
    return [
      ...(isAdmin ? [{
        key: "rename", label: t("folder.rename"),
        onSelect: () => {
          const name = window.prompt(t("folder.namePlaceholder"), f.name);
          if (name?.trim() && name.trim() !== f.name) run(() => renameFolderAction(f.id, name.trim()))();
        },
      }] : []),
      ...(isAdmin ? [{ key: "move", label: t("folder.moveTo"), onSelect: () => { setMenuFolder(f); setMoveOpen(true); } }] : []),
      ...(canShare ? [{ key: "share", label: t("common.share"), onSelect: () => { setMenuFolder(f); setShareOpen(true); } }] : []),
      ...(isAdmin ? [{
        key: "trash", label: t("folder.trashFolder"), danger: true,
        onSelect: () => { if (confirm(t("trash.deleteConfirm"))) run(() => trashFolderAction(f.id))(); },
      }] : []),
    ];
  };

  // Folder ordering pref (UX-BATCH-002): "created" (default, newest first)
  // or "alpha". Persisted in localStorage, synced via liked:prefs.
  const subscribePrefs = useCallback((onChange: () => void) => {
    window.addEventListener("liked:prefs", onChange);
    return () => window.removeEventListener("liked:prefs", onChange);
  }, []);
  const sortMode = useSyncExternalStore(
    subscribePrefs,
    () => (localStorage.getItem("liked.folderSort") === "alpha" ? "alpha" : "created"),
    () => "created"
  );
  const setSortMode = (v: "created" | "alpha") => {
    localStorage.setItem("liked.folderSort", v);
    window.dispatchEvent(new Event("liked:prefs"));
  };
  const sorted = [...folders].sort((a, b) =>
    sortMode === "alpha"
      ? a.name.localeCompare(b.name)
      : new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const onClick = (e: React.MouseEvent, f: Mvp2Folder) => {
    e.preventDefault();
    // Close the panel immediately on selection (UX-BATCH-003).
    onSelect?.();
    if (e.detail === 0) {
      router.push(`/folders/${f.id}`);
      return;
    }
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      const active = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("folder") === f.id;
      router.push(active ? "/feed" : `/feed?folder=${f.id}`);
    }, CLICK_DELAY_MS);
  };

  const onDoubleClick = (e: React.MouseEvent, f: Mvp2Folder) => {
    e.preventDefault();
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    router.push(`/folders/${f.id}`);
    onSelect?.();
  };

  const onDrop = async (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    setOverId(null);
    const nodeId = e.dataTransfer.getData("application/x-liked-node");
    if (!nodeId) return;
    try {
      await moveNodeToFolderAction(nodeId, null, folderId);
      toast.success(t("add.added"));
      onChanged?.();
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("common.error"));
    }
  };

  return (
    <div className="rail folder-rail">
      <div className="fr-sort seg" role="group" aria-label={t("folder.sort")}>
        <button
          type="button"
          className={`seg-btn ${sortMode === "created" ? "seg-on" : ""}`}
          onClick={() => setSortMode("created")}
        >{t("folder.sortCreated")}</button>
        <button
          type="button"
          className={`seg-btn ${sortMode === "alpha" ? "seg-on" : ""}`}
          onClick={() => setSortMode("alpha")}
        >{t("folder.sortAlpha")}</button>
      </div>
      {sorted.map((f) => (
        <div key={f.id} className="fr-wrap">
        <Link
          href={`/folders/${f.id}`}
          className={`rail-item fr-item fr-tile ${overId === f.id ? "fr-over" : ""}`}
          title={f.name}
          onClick={(e) => onClick(e, f)}
          onDoubleClick={(e) => onDoubleClick(e, f)}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverId(f.id); }}
          onDragLeave={() => setOverId(null)}
          onDrop={(e) => onDrop(e, f.id)}
        >
          {coverKey(f) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="fr-cover" src={`${THUMB_BASE}${coverKey(f)}`} alt="" loading="lazy" />
          ) : (
            <span className="fr-cover fr-cover-empty" style={{ background: f.color_hex ?? "var(--surface-3)" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>
            </span>
          )}
          <span className="fr-meta">
            <span className="rail-label fr-name">{f.name}</span>
            <span className="fr-count">{f.node_count}</span>
          </span>
        </Link>
        <ItemMenu title={f.name} actions={menuActions(f)} />
        </div>
      ))}
      <button type="button" className="rail-item rail-manage fr-add" onClick={onAdd} title={t("folder.new")}>
        <span className="rail-plus">+</span>
        <span className="rail-label">{t("folder.new")}</span>
      </button>
      {(moveOpen || shareOpen) && menuFolder && typeof document !== "undefined" && createPortal(
        <>
          <FolderPickModal
            open={moveOpen}
            onClose={() => setMoveOpen(false)}
            title={t("folder.moveTo")}
            excludeId={menuFolder.id}
            allowRoot
            hideSystem
            onPick={(parentId) => {
              run(async () => {
                await moveFolderAction(menuFolder.id, parentId);
                toast.success(t("common.done"));
              })();
              setMoveOpen(false);
            }}
          />
          <ShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            loadTargets={async () => {
              const [fr, gr] = await Promise.all([getFriendBarAction(), getGroupBarAction()]);
              return {
                friends: fr.filter((x) => x.user_id).map((x) => ({ id: x.user_id!, name: x.display_name ?? "", avatarKey: x.avatar_key })),
                groups: gr.map((g) => ({ id: g.id, name: g.name })),
              };
            }}
            onShare={async ({ permission, userIds, groupIds, allFriends }) => {
              await shareFolderV2Action(menuFolder.id, permission, userIds, groupIds, allFriends);
            }}
          />
        </>,
        document.body
      )}
    </div>
  );
}

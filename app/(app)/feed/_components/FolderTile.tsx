"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  moveFolderAction, renameFolderAction, shareFolderV2Action, trashFolderAction,
  type Mvp2Folder,
} from "@/app/lib/actions/mvp2";
import { getFriendBarAction, getGroupBarAction } from "@/app/lib/actions/session";
import { toast } from "@/lib/store/toastStore";
import ItemMenu from "../../_components/ItemMenu";
import FolderPickModal from "../../_components/FolderPickModal";
import ShareSheet from "../../_components/ShareSheet";

const THUMB_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/`;
const CLICK_DELAY_MS = 250;

/** Folder tile — click filters feed (?folder=id, toggles off if active),
 *  double-click enters /folders/[id]; drop target for card drags.
 *  ⋯ menu (permission-gated): move / share / trash. */
export default function FolderTile({
  folder, onDropCard, active = false,
}: {
  folder: Mvp2Folder;
  onDropCard: (nodeId: string, folderId: string) => void;
  active?: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [over, setOver] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const thumbs = (folder.thumbnails as { th: string }[] | string[] | null) ?? [];
  const keys = thumbs.map((x) => (typeof x === "string" ? x : x.th)).filter(Boolean).slice(0, 4);

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    // Keyboard-activated click (Enter) has detail 0 — enter the folder.
    if (e.detail === 0) {
      router.push(`/folders/${folder.id}`);
      return;
    }
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      router.push(active ? "/feed" : `/feed?folder=${folder.id}`);
    }, CLICK_DELAY_MS);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
    router.push(`/folders/${folder.id}`);
  };

  const isAdmin = folder.my_permission === "admin" && !folder.system_kind;
  const canShare = ["admin", "reshare"].includes(folder.my_permission);
  const run = (fn: () => Promise<unknown>) => async () => {
    try {
      await fn();
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };
  const actions = [
    ...(isAdmin ? [{
      key: "rename", label: t("folder.rename"),
      onSelect: () => {
        const name = window.prompt(t("folder.namePlaceholder"), folder.name);
        if (name?.trim() && name.trim() !== folder.name) run(() => renameFolderAction(folder.id, name.trim()))();
      },
    }] : []),
    ...(isAdmin ? [{ key: "move", label: t("folder.moveTo"), onSelect: () => setMoveOpen(true) }] : []),
    ...(canShare ? [{ key: "share", label: t("common.share"), onSelect: () => setShareOpen(true) }] : []),
    ...(isAdmin ? [{
      key: "trash", label: t("folder.trashFolder"), danger: true,
      onSelect: () => { if (confirm(t("trash.deleteConfirm"))) run(() => trashFolderAction(folder.id))(); },
    }] : []),
  ];

  return (
    <div className="ft-wrap">
      <Link
        href={`/folders/${folder.id}`}
        className={`folder-tile ${over ? "folder-tile-over" : ""} ${active ? "folder-tile-active" : ""}`}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const nodeId = e.dataTransfer.getData("application/x-liked-node");
          if (nodeId) onDropCard(nodeId, folder.id);
        }}
      >
        <div className="ft-thumbs">
          {keys.length > 0 ? (
            keys.map((k) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={k} src={`${THUMB_BASE}${k}`} alt="" width={40} height={40} loading="lazy" />
            ))
          ) : (
            <span className="ft-glyph" style={{ color: folder.color_hex ?? "var(--accent)" }}>▸</span>
          )}
        </div>
        <div className="ft-name">
          {folder.name}
          {folder.is_shared && <span className="ft-shared" title="shared">⇄</span>}
        </div>
        <div className="ft-meta">
          {folder.node_count}
          {folder.system_kind && <em className="ft-sys">{folder.system_kind}</em>}
        </div>
      </Link>
      <ItemMenu title={folder.name} actions={actions} />
      {(moveOpen || shareOpen) && typeof document !== "undefined" && createPortal(
        <>
          <FolderPickModal
            open={moveOpen}
            onClose={() => setMoveOpen(false)}
            title={t("folder.moveTo")}
            excludeId={folder.id}
            allowRoot
            hideSystem
            onPick={(parentId) => {
              run(async () => {
                await moveFolderAction(folder.id, parentId);
                toast.success(t("common.done"));
              })();
            }}
          />
          <ShareSheet
            open={shareOpen}
            onClose={() => setShareOpen(false)}
            loadTargets={async () => {
              const [fr, gr] = await Promise.all([getFriendBarAction(), getGroupBarAction()]);
              return {
                friends: fr.filter((f) => f.user_id).map((f) => ({ id: f.user_id!, name: f.display_name ?? "", avatarKey: f.avatar_key })),
                groups: gr.map((g) => ({ id: g.id, name: g.name })),
              };
            }}
            onShare={async ({ permission, userIds, groupIds, allFriends }) => {
              await shareFolderV2Action(folder.id, permission, userIds, groupIds, allFriends);
            }}
          />
        </>,
        document.body
      )}
    </div>
  );
}

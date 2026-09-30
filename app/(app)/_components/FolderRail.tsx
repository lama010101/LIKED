"use client";

/** Folders rail — left-panel variant of the folder section (folders-top ↔
 *  friends-top layout pref). Click filters /feed?folder=id (toggles off when
 *  active), Enter/double-click enters /folders/[id]; items are drop targets
 *  for card drags (same as FolderTile). */

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { moveNodeToFolderAction, type Mvp2Folder } from "@/app/lib/actions/mvp2";
import { toast } from "@/lib/store/toastStore";

const CLICK_DELAY_MS = 250;

export default function FolderRail({ folders, onAdd, onChanged }: {
  folders: Mvp2Folder[];
  onAdd: () => void;
  onChanged?: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const onClick = (e: React.MouseEvent, f: Mvp2Folder) => {
    e.preventDefault();
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
      {folders.map((f) => (
        <Link
          key={f.id}
          href={`/folders/${f.id}`}
          className={`rail-item fr-item ${overId === f.id ? "fr-over" : ""}`}
          title={f.name}
          onClick={(e) => onClick(e, f)}
          onDoubleClick={(e) => onDoubleClick(e, f)}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setOverId(f.id); }}
          onDragLeave={() => setOverId(null)}
          onDrop={(e) => onDrop(e, f.id)}
        >
          <span className="fr-glyph" style={{ color: f.color_hex ?? undefined }}>▸</span>
          <span className="rail-label">{f.name}</span>
        </Link>
      ))}
      <button type="button" className="rail-item rail-manage fr-add" onClick={onAdd} title={t("folder.new")}>
        <span className="rail-plus">+</span>
        <span className="rail-label">{t("folder.new")}</span>
      </button>
    </div>
  );
}

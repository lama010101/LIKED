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

  const onClick = (e: React.MouseEvent, f: Mvp2Folder) => {
    e.preventDefault();
    if (e.detail === 0) {
      router.push(`/folders/${f.id}`);
      onSelect?.();
      return;
    }
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      const active = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("folder") === f.id;
      router.push(active ? "/feed" : `/feed?folder=${f.id}`);
      onSelect?.();
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
      {folders.map((f) => (
        <Link
          key={f.id}
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
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/></svg>
            </span>
          )}
          <span className="rail-label fr-name">{f.name}</span>
          <span className="fr-count">{f.node_count}</span>
        </Link>
      ))}
      <button type="button" className="rail-item rail-manage fr-add" onClick={onAdd} title={t("folder.new")}>
        <span className="rail-plus">+</span>
        <span className="rail-label">{t("folder.new")}</span>
      </button>
    </div>
  );
}

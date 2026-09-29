"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Mvp2Folder } from "@/app/lib/actions/mvp2";

const THUMB_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/`;
const CLICK_DELAY_MS = 250;

/** Folder tile — click filters feed (?folder=id, toggles off if active),
 *  double-click enters /folders/[id]; drop target for card drags. */
export default function FolderTile({
  folder, onDropCard, active = false,
}: {
  folder: Mvp2Folder;
  onDropCard: (nodeId: string, folderId: string) => void;
  active?: boolean;
}) {
  const router = useRouter();
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [over, setOver] = useState(false);
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

  return (
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
  );
}

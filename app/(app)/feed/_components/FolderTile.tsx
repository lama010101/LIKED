"use client";

/**
 * FolderTile — extracted from FeedGrid.tsx
 * Renders a single folder card in the feed's folder grid.
 * Draggable (folder → folder nesting, folder → friend sharing).
 */

import Image from "next/image";
import { useDraggable } from "@dnd-kit/core";
import { sourceId } from "@/lib/dnd/types";
import type { Folder } from "@/lib/types/app";
import { toast } from "@/lib/store/toastStore";
import { CardMenu, ShareIcon, RenameIcon, DeleteIcon } from "@/components/modals/CardMenu";

export interface FolderTileProps {
  folder: Folder;
  isActive: boolean;
  onClick: (folder: Folder) => void;
  currentUserId: string;
  onFolderDelete?: (folderId: string) => void;
  onFolderRename?: (folder: Folder) => void;
  onFolderShare?: (folder: Folder) => void;
}

export default function FolderTile({
  folder,
  isActive,
  onClick,
  currentUserId,
  onFolderDelete,
  onFolderRename,
  onFolderShare,
}: FolderTileProps) {
  const color = folder.color_hex || '#7c5cbf';
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const hasThumbnails = folder.thumbnails && folder.thumbnails.length > 0;
  const isOwned = folder.owner_id === currentUserId;

  // Drag source: folder can be dragged to nest inside another folder
  // or drop onto a friend avatar to share.
  const {
    attributes,
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: sourceId({ kind: "folder", folderId: folder.id }),
    data: { dragSource: { kind: "folder", folderId: folder.id } },
  });

  const handleFolderDelete = async () => {
    const res = await fetch(`/api/folders/${folder.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      onFolderDelete?.(folder.id);
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error || 'Failed to delete folder. Please try again.');
    }
  };

  // Build menu items
  const menuItems = [
    ...(onFolderShare ? [{
      label: "Share with...",
      icon: <ShareIcon />,
      onClick: () => onFolderShare(folder),
    }] : []),
    ...(onFolderRename ? [{
      label: "Rename",
      icon: <RenameIcon />,
      onClick: () => onFolderRename(folder),
    }] : []),
    {
      label: "Delete",
      icon: <DeleteIcon />,
      onClick: handleFolderDelete,
      variant: "danger" as const,
    },
  ];

  return (
    <div
      ref={setDragRef}
      onClick={() => {
        onClick(folder);
      }}
      {...attributes}
      {...listeners}
      className="folder-tile"
      style={{
        aspectRatio: '1 / 1',
        borderRadius: 10,
        position: 'relative',
        overflow: 'hidden',
        cursor: isDragging ? 'grabbing' : 'pointer',
        pointerEvents: 'auto',
        background: `linear-gradient(135deg, ${color}cc, ${color}66)`,
        boxShadow: isActive ? `0 0 0 3px #fff, 0 0 0 5px ${color}` : 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '8px',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease',
        opacity: isDragging ? 0.4 : 1,
        touchAction: 'none', // prevent scroll while dragging on touch
      }}
    >
      {/* 2x2 thumbnail collage or fallback color collage */}
      {hasThumbnails ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr',
            gap: '1px',
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="w-1/2 h-1/2 overflow-hidden" style={{ position: 'relative' }}>
              {folder.thumbnails[i] ? (
                <Image
                  src={supabaseUrl + '/storage/v1/object/public/thumbnails/' + folder.thumbnails[i]}
                  alt=""
                  fill
                  sizes="50px"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full"
                  style={{ background: color + '55' }}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr',
          }}
        >
          {[`${color}dd`, `${color}99`, `${color}bb`, `${color}55`].map((bg, i) => (
            <div key={i} style={{ background: bg }} />
          ))}
        </div>
      )}
      {/* Folder icon overlay */}
      <div style={{
        position: 'absolute', top: 8, left: 8,
        width: 24, height: 24, borderRadius: 6,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </div>

      {/* Menu (portal-based, escapes overflow:hidden) */}
      <CardMenu items={menuItems} ariaLabel="Folder menu" show={isOwned} />

      {/* Name + count overlay at bottom */}
      <div style={{
        position: 'relative', zIndex: 1,
        background: 'linear-gradient(to top, rgba(0,0,0,0.72), transparent)',
        margin: '-8px', padding: '20px 8px 8px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', lineHeight: 1.2, wordBreak: 'break-word' }}>
          {folder.name}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
          {folder.node_count === 1 ? '1 item' : `${folder.node_count} items`}
        </div>
      </div>
    </div>
  );
}

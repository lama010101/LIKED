"use client";

import Image from "next/image";
import type { ViewProps, FeedItem } from "@/lib/types/feed";
import { toast } from "@/lib/store/toastStore";
import { CardMenu, ShareIcon, MoveFolderIcon, TagIcon, DeleteIcon } from "@/components/modals/CardMenu";

function FolderCollage({ item, size }: { item: FeedItem; size: number }) {
  const base = item.folderColor ?? "#888";
  const quadrants = [
    `linear-gradient(135deg, ${base}cc, ${base}66)`,
    `linear-gradient(225deg, ${base}aa, ${base}44)`,
    `linear-gradient(45deg,  ${base}88, ${base}cc)`,
    `linear-gradient(315deg, ${base}55, ${base}99)`,
  ];
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {quadrants.map((bg, i) => (
        <div key={i} style={{ background: bg }} />
      ))}
    </div>
  );
}

function ColTile({
  item,
  onClick,
  currentUserId,
  onCardShare,
  onCardMoveToFolder,
  onCardAddTag,
  onCardDelete,
}: {
  item: FeedItem;
  zoom: number;
  onClick: (item: FeedItem) => void;
  currentUserId?: string;
  onCardShare?: (item: FeedItem) => void;
  onCardMoveToFolder?: (item: FeedItem) => void;
  onCardAddTag?: (item: FeedItem) => void;
  onCardDelete?: (nodeId: string) => void;
}) {
  const handleCardDelete = async () => {
    const res = await fetch(`/api/nodes/${item.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      onCardDelete?.(item.id);
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error || 'Failed to delete card. Please try again.');
    }
  };
  const showOverlays = true;
  const isOwned = currentUserId && item.ownerId === currentUserId;

  const menuItems = [
    ...(onCardShare ? [{ label: "Share with...", icon: <ShareIcon />, onClick: () => onCardShare(item) }] : []),
    ...(onCardMoveToFolder ? [{ label: "Move to folder", icon: <MoveFolderIcon />, onClick: () => onCardMoveToFolder(item) }] : []),
    ...(onCardAddTag ? [{ label: "Add tag", icon: <TagIcon />, onClick: () => onCardAddTag(item) }] : []),
    { label: "Delete", icon: <DeleteIcon />, onClick: handleCardDelete, variant: "danger" as const },
  ];

  return (
    <div
      onClick={() => onClick(item)}
      style={{
        aspectRatio: "1 / 1",
        borderRadius: 10,
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
        background: item.art,
      }}
    >
      {/* Real thumbnail if available */}
      {item.thumbnailKey && (
        <Image
          src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/${item.thumbnailKey}`}
          alt={item.title}
          fill
          sizes="200px"
          style={{
            objectFit: "cover",
          }}
        />
      )}
      {item.kind === "folder" && (
        <div style={{ position: "absolute", inset: 0 }}>
          <FolderCollage item={item} size={999} />
        </div>
      )}

      {showOverlays && (
        <>
          {/* Title gradient overlay */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              padding: "4px 6px 6px",
              fontSize: 11,
              fontWeight: 700,
              color: "#fff",
              background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent)",
            }}
          >
            {item.title}
            {item.kind === "folder" && item.folderCount != null && (
              <span style={{ fontWeight: 400, opacity: 0.8, marginLeft: 4 }}>
                ({item.folderCount})
              </span>
            )}
          </div>

          {/* Rating badge */}
          {item.rating != null && item.rating > 0 && (
            <div
              style={{
                position: "absolute",
                top: 4,
                left: 4,
                display: "flex",
                alignItems: "center",
                gap: 2,
                background: "rgba(0,0,0,0.55)",
                borderRadius: 5,
                padding: "2px 5px",
                fontSize: 9,
                fontWeight: 700,
                color: "var(--accent)",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="#f5a623" aria-hidden="true">
                <polygon points="5,1 6.2,3.8 9.5,4.1 7.1,6.3 7.9,9.5 5,7.8 2.1,9.5 2.9,6.3 0.5,4.1 3.8,3.8" />
              </svg>
              {item.rating}
            </div>
          )}

          {/* Sent indicator (top-right when no rating, or stacked) */}
          {item.sentTo && item.sentTo.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 9,
                height: 9,
                borderRadius: 2,
                background: "rgba(167,139,250,0.95)",
              }}
            />
          )}

          {/* Direction dot */}
          <div
            style={{
              position: "absolute",
              bottom: 22,
              right: 4,
              width: 9,
              height: 9,
              borderRadius: "50%",
              border: "1.5px solid rgba(0,0,0,0.3)",
              background: item.dir === "mine" ? "var(--accent)" : "#60c5f1",
            }}
          />

          {/* Folder color dot */}
          {item.kind === "folder" && item.folderColor && (
            <div
              style={{
                position: "absolute",
                top: 4,
                left: 4,
                width: 8,
                height: 8,
                borderRadius: 2,
                background: item.folderColor,
              }}
            />
          )}

          {/* Menu (portal-based, escapes overflow:hidden) */}
          <CardMenu items={menuItems} ariaLabel="Card menu" show={!!isOwned} />
        </>
      )}
    </div>
  );
}

interface ColViewProps extends ViewProps {
  currentUserId?: string;
  onCardShare?: (item: FeedItem) => void;
  onCardMoveToFolder?: (item: FeedItem) => void;
  onCardAddTag?: (item: FeedItem) => void;
  onCardDelete?: (nodeId: string) => void;
}

export default function ColView({ items, zoom = 2, onItemClick, currentUserId, onCardShare, onCardMoveToFolder, onCardAddTag, onCardDelete }: ColViewProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${zoom}, 1fr)`,
        gap: 3,
        padding: 4,
      }}
    >
      {items.map((item) => (
        <ColTile key={item.id} item={item} zoom={zoom} onClick={onItemClick} currentUserId={currentUserId} onCardShare={onCardShare} onCardMoveToFolder={onCardMoveToFolder} onCardAddTag={onCardAddTag} onCardDelete={onCardDelete} />
      ))}
    </div>
  );
}

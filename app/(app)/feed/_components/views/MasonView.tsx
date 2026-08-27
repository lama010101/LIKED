"use client";

import type { ViewProps, FeedItem } from "@/lib/types/feed";
import { toast } from "@/lib/store/toastStore";
import { CardMenu, ShareIcon, MoveFolderIcon, TagIcon, DeleteIcon } from "@/components/modals/CardMenu";

function FolderMiniCollage({ item }: { item: FeedItem }) {
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
        width: "100%",
        height: 80,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gridTemplateRows: "1fr 1fr",
      }}
    >
      {quadrants.map((bg, i) => (
        <div key={i} style={{ background: bg }} />
      ))}
    </div>
  );
}

function MasonCard({ item, onClick, currentUserId, onCardShare, onCardMoveToFolder, onCardAddTag, onCardDelete }: { item: FeedItem; onClick: (item: FeedItem) => void; currentUserId?: string; onCardShare?: (item: FeedItem) => void; onCardMoveToFolder?: (item: FeedItem) => void; onCardAddTag?: (item: FeedItem) => void; onCardDelete?: (nodeId: string) => void; }) {
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

  const isOwned = currentUserId && item.ownerId === currentUserId;

  const menuItems = [
    ...(onCardShare ? [{ label: "Share with...", icon: <ShareIcon />, onClick: () => onCardShare(item) }] : []),
    ...(onCardMoveToFolder ? [{ label: "Move to folder", icon: <MoveFolderIcon />, onClick: () => onCardMoveToFolder(item) }] : []),
    ...(onCardAddTag ? [{ label: "Add tag", icon: <TagIcon />, onClick: () => onCardAddTag(item) }] : []),
    { label: "Delete", icon: <DeleteIcon />, onClick: handleCardDelete, variant: "danger" as const },
  ];

  const mediaH =
    item.kind === "folder"
      ? 80
      : 60 + (item.id.charCodeAt(item.id.length - 1) % 5) * 18;

  return (
    <div
      onClick={() => onClick(item)}
      style={{
        borderRadius: 10,
        overflow: "hidden",
        background: "var(--surface-3)",
        cursor: "pointer",
        breakInside: "avoid",
        marginBottom: 3,
        position: "relative",
      }}
    >
      {/* Media area */}
      <div style={{ width: "100%", height: mediaH, display: "block", position: "relative" }}>
        {item.kind === "folder" ? (
          <FolderMiniCollage item={item} />
        ) : (
          <div style={{ width: "100%", height: "100%", background: item.art }} />
        )}
        {/* Direction badge - mine vs received */}
        {item.dir && (
          <div
            style={{
              position: "absolute",
              top: 6,
              left: 6,
              width: 9,
              height: 9,
              borderRadius: "50%",
              border: "1.5px solid rgba(0,0,0,0.3)",
              background: item.dir === "mine" ? "var(--accent)" : "#60c5f1",
            }}
          />
        )}
      </div>

      {/* Meta area */}
      <div style={{ padding: "5px 8px 8px" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: "var(--text-1)",
            lineHeight: 1.3,
            marginBottom: 3,
          }}
        >
          {item.title}
          {item.kind === "folder" && item.folderCount != null && (
            <span style={{ fontWeight: 400, color: "var(--text-3)", marginLeft: 4 }}>
              ({item.folderCount})
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          {item.tag && (
            <span
              style={{
                display: "inline-block",
                fontSize: 9,
                padding: "1px 5px",
                borderRadius: 4,
                background: item.tagColor ?? "var(--surface-4)",
                color: "#fff",
                fontWeight: 700,
              }}
            >
              {item.tag}
            </span>
          )}

          {item.rating != null && item.rating > 0 && (
            <div
              style={{
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
              <svg width="8" height="8" viewBox="0 0 10 10" fill="#f5a623" aria-hidden="true">
                <polygon points="5,1 6.2,3.8 9.5,4.1 7.1,6.3 7.9,9.5 5,7.8 2.1,9.5 2.9,6.3 0.5,4.1 3.8,3.8" />
              </svg>
              {item.rating}
            </div>
          )}
        </div>
      </div>

      {/* Menu (portal-based, escapes overflow:hidden) */}
      <CardMenu items={menuItems} ariaLabel="Card menu" show={!!isOwned} />
    </div>
  );
}

interface MasonViewProps extends ViewProps {
  currentUserId?: string;
  onCardShare?: (item: FeedItem) => void;
  onCardMoveToFolder?: (item: FeedItem) => void;
  onCardAddTag?: (item: FeedItem) => void;
  onCardDelete?: (nodeId: string) => void;
}

export default function MasonView({ items, onItemClick, currentUserId, onCardShare, onCardMoveToFolder, onCardAddTag, onCardDelete }: MasonViewProps) {
  return (
    <div
      className="mason-cols"
      style={{
        columnGap: 3,
        padding: 4,
      }}
    >
      <style>{`
        .mason-cols { columns: 2; }
        @media (min-width: 768px) { .mason-cols { columns: 3; } }
      `}</style>
      {items.map((item) => (
        <MasonCard key={item.id} item={item} onClick={onItemClick} currentUserId={currentUserId} onCardShare={onCardShare} onCardMoveToFolder={onCardMoveToFolder} onCardAddTag={onCardAddTag} onCardDelete={onCardDelete} />
      ))}
    </div>
  );
}

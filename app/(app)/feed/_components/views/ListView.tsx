"use client";

/**
 * ListView — PROTO V2 .video-list-item rows (UIX-07 restyle).
 * 160px 16:9 thumb + title + creator + real stats footer.
 */

import Image from "next/image";
import type { ViewProps, FeedItem } from "@/lib/types/feed";
import { toast } from "@/lib/store/toastStore";
import { CardMenu, ShareIcon, MoveFolderIcon, TagIcon, DeleteIcon } from "@/components/modals/CardMenu";

const StarGlyph = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);
const ShareGlyph = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);
const EyeGlyph = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

function ListRow({ item, onClick, currentUserId, onCardShare, onCardMoveToFolder, onCardAddTag, onCardDelete }: { item: FeedItem; onClick: (item: FeedItem) => void; currentUserId?: string; onCardShare?: (item: FeedItem) => void; onCardMoveToFolder?: (item: FeedItem) => void; onCardAddTag?: (item: FeedItem) => void; onCardDelete?: (nodeId: string) => void; }) {
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

  const creator = item.senderName ?? item.source ?? (item.isText ? 'Text note' : '');
  const hasStats =
    (item.rating != null && item.rating > 0) ||
    (item.shareCount != null && item.shareCount > 0) ||
    (item.viewCount != null && item.viewCount > 0);

  return (
    <div
      className="video-list-item"
      onClick={() => onClick(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(item);
        }
      }}
    >
      <div className="thumb-wrap">
        {item.kind === "folder" ? (
          <div
            className="thumb"
            style={{ background: item.folderColor ?? 'var(--surface-4)' }}
          />
        ) : item.thumbnailKey ? (
          <Image
            src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/${item.thumbnailKey}`}
            alt={item.title}
            fill
            sizes="160px"
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <div className="thumb" style={{ background: item.art }} />
        )}
        {item.dir && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              width: 9,
              height: 9,
              borderRadius: '50%',
              border: '1.5px solid rgba(0,0,0,0.3)',
              background: item.dir === 'mine' ? 'var(--accent)' : 'var(--blue)',
            }}
          />
        )}
      </div>

      <div className="video-list-meta">
        <div className="video-list-title">
          {item.title}
          {item.kind === 'folder' && item.folderCount != null && (
            <span style={{ fontWeight: 400, color: 'var(--text-3)' }}> ({item.folderCount})</span>
          )}
        </div>
        {creator && <div className="video-list-creator">{creator}</div>}
        {hasStats && (
          <div className="video-list-footer">
            {item.rating != null && item.rating > 0 && (
              <span className="stat" style={{ color: 'var(--orange)' }}>
                {StarGlyph}
                {item.rating}
              </span>
            )}
            {item.shareCount != null && item.shareCount > 0 && (
              <span className="stat">
                {ShareGlyph}
                {item.shareCount}
              </span>
            )}
            {item.viewCount != null && item.viewCount > 0 && (
              <span className="stat">
                {EyeGlyph}
                {item.viewCount}
              </span>
            )}
          </div>
        )}
      </div>

      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--text-3)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0, transform: 'rotate(180deg)' }}
        aria-hidden="true"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>

      <CardMenu items={menuItems} ariaLabel="Card menu" show={!!isOwned} />
    </div>
  );
}

interface ListViewProps extends ViewProps {
  currentUserId?: string;
  onCardShare?: (item: FeedItem) => void;
  onCardMoveToFolder?: (item: FeedItem) => void;
  onCardAddTag?: (item: FeedItem) => void;
  onCardDelete?: (nodeId: string) => void;
}

export default function ListView({ items, onItemClick, currentUserId, onCardShare, onCardMoveToFolder, onCardAddTag, onCardDelete }: ListViewProps) {
  return (
    <div className="video-grid list-view">
      {items.map((item) => (
        <ListRow key={item.id} item={item} onClick={onItemClick} currentUserId={currentUserId} onCardShare={onCardShare} onCardMoveToFolder={onCardMoveToFolder} onCardAddTag={onCardAddTag} onCardDelete={onCardDelete} />
      ))}
    </div>
  );
}

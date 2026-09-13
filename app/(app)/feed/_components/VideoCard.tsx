'use client';

/**
 * VideoCard — PROTO V2 16:9 card (UIX-PORT-00 / UIX-07).
 * Shared by Col/Mason/Horiz views (and used by UIX-09 folder content).
 * Maps ONLY real feed fields: thumbnail_key, title, sender_name/source
 * (creator line), avg_rating, share_count, view_count.
 * Keeps prod behaviors: direction dot, owner CardMenu, delete API.
 */

import { useState } from 'react';
import Image from 'next/image';
import type { FeedItem } from '@/lib/types/feed';
import type { Folder } from '@/lib/types/app';
import { toast } from '@/lib/store/toastStore';
import { CardMenu, ShareIcon, MoveFolderIcon, TagIcon, DeleteIcon } from '@/components/modals/CardMenu';
import CardActionSheet from '@/components/sheets/CardActionSheet';
import FolderTreePicker from '@/components/sheets/FolderTreePicker';
import { useIsMobile } from '@/app/(app)/_lib/useIsMobile';

const StarGlyph = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);
const ShareGlyph = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);
const EyeGlyph = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
);
const TextGlyph = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M4 7V5h16v2" /><path d="M12 5v14" /><path d="M9 19h6" />
  </svg>
);

function FolderCollage({ color }: { color?: string }) {
  const base = color ?? '#888';
  const quadrants = [
    `linear-gradient(135deg, ${base}cc, ${base}66)`,
    `linear-gradient(225deg, ${base}aa, ${base}44)`,
    `linear-gradient(45deg,  ${base}88, ${base}cc)`,
    `linear-gradient(315deg, ${base}55, ${base}99)`,
  ];
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gridTemplateRows: '1fr 1fr',
      }}
    >
      {quadrants.map((bg, i) => (
        <div key={i} style={{ background: bg }} />
      ))}
    </div>
  );
}

export interface VideoCardProps {
  item: FeedItem;
  onClick: (item: FeedItem) => void;
  currentUserId?: string;
  onCardShare?: (item: FeedItem) => void;
  onCardMoveToFolder?: (item: FeedItem) => void;
  onCardAddTag?: (item: FeedItem) => void;
  onCardDelete?: (nodeId: string) => void;
  /** Folders for the mobile move/copy tree picker. */
  folders?: Folder[];
  /** Folder the card currently sits in (move source). */
  sourceFolderId?: string | null;
  /** Called after move/copy completes (e.g. feed refresh). */
  onChanged?: () => void;
  /** 'mason' → break-inside avoid; 'horiz' → fixed strip width. */
  variant?: 'grid' | 'mason' | 'horiz';
}

export default function VideoCard({
  item,
  onClick,
  currentUserId,
  onCardShare,
  onCardMoveToFolder,
  onCardAddTag,
  onCardDelete,
  folders,
  sourceFolderId = null,
  onChanged,
  variant = 'grid',
}: VideoCardProps) {
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'move' | 'copy' | null>(null);
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
    ...(onCardShare ? [{ label: 'Share with...', icon: <ShareIcon />, onClick: () => onCardShare(item) }] : []),
    ...(onCardMoveToFolder ? [{ label: 'Move to folder', icon: <MoveFolderIcon />, onClick: () => onCardMoveToFolder(item) }] : []),
    ...(onCardAddTag ? [{ label: 'Add tag', icon: <TagIcon />, onClick: () => onCardAddTag(item) }] : []),
    { label: 'Delete', icon: <DeleteIcon />, onClick: handleCardDelete, variant: 'danger' as const },
  ];

  const creator =
    item.senderName ?? item.source ?? (item.isText ? 'Text note' : '');

  const hasStats =
    (item.rating != null && item.rating > 0) ||
    (item.shareCount != null && item.shareCount > 0) ||
    (item.viewCount != null && item.viewCount > 0);

  return (
    <div
      className="video-card"
      onClick={() => onClick(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(item);
        }
      }}
      style={
        variant === 'mason'
          ? { breakInside: 'avoid', marginBottom: 16 }
          : variant === 'horiz'
            ? { width: 200, flexShrink: 0 }
            : undefined
      }
    >
      <div className="thumb-wrap">
        {item.kind === 'folder' ? (
          <FolderCollage color={item.folderColor} />
        ) : item.thumbnailKey ? (
          <Image
            src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/${item.thumbnailKey}`}
            alt={item.title}
            fill
            sizes="(max-width: 700px) 50vw, 25vw"
            style={{ objectFit: 'cover' }}
          />
        ) : (
          <div className="thumb" style={{ background: item.art }} />
        )}
        {item.isText && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255,255,255,0.9)',
            }}
          >
            {TextGlyph}
          </div>
        )}
        {/* Direction dot — mine vs received (prod semantic, kept; left
            side so it doesn't collide with the CardMenu trigger) */}
        {item.dir && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              width: 9,
              height: 9,
              borderRadius: '50%',
              border: '1.5px solid rgba(0,0,0,0.3)',
              background: item.dir === 'mine' ? 'var(--accent)' : 'var(--blue)',
            }}
          />
        )}
        {isOwned && (
          isMobile ? (
            <button
              type="button"
              aria-label="Card menu"
              onClick={(e) => {
                e.stopPropagation();
                setSheetOpen(true);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: 8,
                right: 8,
                width: 28,
                height: 28,
                borderRadius: 9999,
                background: 'rgba(0,0,0,0.35)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 4,
                cursor: 'pointer',
                border: 'none',
                padding: 0,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                <circle cx="12" cy="6" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="18" r="2" />
              </svg>
            </button>
          ) : (
            <CardMenu items={menuItems} ariaLabel="Card menu" show />
          )
        )}
      </div>

      <div className="video-info">
        <div className="video-title">
          {item.title}
          {item.kind === 'folder' && item.folderCount != null && (
            <span style={{ fontWeight: 400, color: 'var(--text-3)' }}> ({item.folderCount})</span>
          )}
        </div>
        {creator && <div className="video-creator">{creator}</div>}
        {hasStats && (
          <div className="video-stats">
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

      {/* Mobile: bottom action sheet + folder tree picker (UIX-10) */}
      {sheetOpen && (
        <CardActionSheet
          title={item.title}
          onClose={() => setSheetOpen(false)}
          onShare={onCardShare ? () => onCardShare(item) : undefined}
          onMove={folders ? () => setPickerMode('move') : onCardMoveToFolder ? () => onCardMoveToFolder(item) : undefined}
          onCopy={folders ? () => setPickerMode('copy') : undefined}
          onAddTag={onCardAddTag ? () => onCardAddTag(item) : undefined}
          onDelete={handleCardDelete}
        />
      )}
      {pickerMode && folders && (
        <FolderTreePicker
          nodeId={item.id}
          mode={pickerMode}
          folders={folders}
          sourceFolderId={sourceFolderId}
          onClose={() => setPickerMode(null)}
          onDone={onChanged}
        />
      )}
    </div>
  );
}

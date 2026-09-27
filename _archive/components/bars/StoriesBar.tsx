'use client';

/**
 * StoriesBar — PROTO V2 story rail (UIX-PORT-00 / UIX-03).
 * Replaces BottomBar: Me + unified friend/group rings + Manage/New group.
 *
 * Preserves existing behaviors:
 * - friend items: draggable (friend→friend auto-group, friend→folder share)
 *   + droppable (node→friend direct share)
 * - group items: droppable (node→group share)
 * - friend long-press / right-click → onFriendLongPress (action sheet)
 * - pending invites dimmed + not tappable
 * - multi-select mode (P7-T03): tap toggles selection, dnd disabled
 */

import { useCallback, useEffect, useState } from 'react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { sourceId, targetId, DragSource, DropTarget } from '@/lib/dnd/types';
import { useLongPress } from '@/lib/hooks/useLongPress';
import { useSelectionStore, SelectionKind } from '@/lib/store/selectionStore';
import { useFilterStore } from '@/lib/store/filterStore';
import { supabaseBrowser } from '@/lib/supabase/client';
import type { BottomBarItem } from '@/app/(app)/_lib/friendBarToBottomBarItems';

const GROUP_COLORS = [
  'var(--accent)',
  'var(--blue)',
  'var(--purple)',
  'var(--green)',
  'var(--orange)',
];

function groupInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function avatarUrl(avatarKey: string | null | undefined): string | null {
  if (!avatarKey) return null;
  return supabaseBrowser.storage.from('avatars').getPublicUrl(avatarKey).data.publicUrl;
}

const PlusIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

interface StoryItemProps {
  item: BottomBarItem;
  isActive: boolean;
  hasAccess?: boolean;
  onClick: (id: string, type: 'me' | 'friend' | 'group') => void;
  onFriendLongPress?: (item: BottomBarItem) => void;
  groupColorIndex?: number;
}

function StoryItem({ item, isActive, hasAccess, onClick, onFriendLongPress, groupColorIndex }: StoryItemProps) {
  // Disable DnD during SSR to prevent hydration mismatch
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setIsMounted(true));
  }, []);

  const dropTarget: DropTarget | null =
    item.type === 'friend'
      ? { kind: 'friend', friendUserId: item.id }
      : item.type === 'group'
        ? { kind: 'group', groupId: item.id }
        : null;

  const dragSource: DragSource | null =
    item.type === 'friend' ? { kind: 'friend', friendUserId: item.id } : null;

  const selectionKind: SelectionKind | null =
    item.type === 'friend' ? 'friend' : item.type === 'group' ? 'group' : null;
  const selectionActive = useSelectionStore((s) => s.isActive);
  const toggle = useSelectionStore((s) => s.toggle);

  const canLongPress = item.type === 'friend' && !item.is_pending;
  const longPressRef = useLongPress(
    useCallback(() => {
      if (canLongPress && onFriendLongPress) onFriendLongPress(item);
    }, [canLongPress, onFriendLongPress, item]),
    { delayMs: 500, disabled: !canLongPress }
  );

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dropTarget ? targetId(dropTarget) : `me:${item.id}`,
    disabled: !dropTarget || selectionActive || !isMounted,
    data: dropTarget ? { dropTarget } : undefined,
  });

  const {
    setNodeRef: setDragRef,
    attributes,
    listeners,
    isDragging,
  } = useDraggable({
    id: dragSource ? sourceId(dragSource) : `me-src:${item.id}`,
    disabled: !dragSource || selectionActive || !isMounted,
    data: dragSource ? { dragSource } : undefined,
  });

  const setRef = (el: HTMLDivElement | null) => {
    setDropRef(el);
    setDragRef(el);
    longPressRef(el);
  };

  const handleClick = () => {
    if (item.is_pending) return;
    if (selectionActive && selectionKind) {
      toggle({ kind: selectionKind, id: item.id });
      return;
    }
    onClick(item.id, item.type);
  };

  const imgUrl = avatarUrl(item.avatarKey);
  const groupBg =
    item.type === 'group' && groupColorIndex !== undefined
      ? GROUP_COLORS[groupColorIndex % GROUP_COLORS.length]
      : item.bg;

  return (
    <div
      ref={setRef}
      {...(dragSource && !selectionActive && isMounted ? attributes : {})}
      {...(dragSource && !selectionActive && isMounted ? listeners : {})}
      className={`story${item.is_pending ? ' story-pending' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={item.type === 'me' ? 'Your feed' : `${item.displayName}${item.type === 'group' ? ' group' : ''}`}
      title={item.is_pending ? 'Invite sent — awaiting signup' : undefined}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      onContextMenu={
        canLongPress
          ? (e) => {
              e.preventDefault();
              onFriendLongPress?.(item);
            }
          : undefined
      }
      style={{
        opacity: isDragging ? 0.5 : 1,
        transition: 'opacity 0.1s',
        cursor: dragSource && !selectionActive ? 'grab' : 'pointer',
      }}
    >
      <div
        className={`story-ring${isActive ? ' active' : ''}${isOver ? ' drop-over' : ''}`}
        style={hasAccess ? { boxShadow: '0 0 0 3px var(--accent, #7c5cfc)', borderRadius: '50%' } : undefined}
      >
        <div
          className="story-img"
          style={
            imgUrl
              ? { backgroundImage: `url('${imgUrl}')` }
              : {
                  background: groupBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 14,
                }
          }
        >
          {!imgUrl &&
            (item.type === 'group' ? groupInitials(item.displayName) : item.initial)}
        </div>
        {item.type === 'group' && item.memberCount !== undefined && (
          <span className="story-count-badge">{item.memberCount}</span>
        )}
      </div>
      <div className="story-name">{item.displayName}</div>
    </div>
  );
}

interface StoriesBarProps {
  items: BottomBarItem[];
  /** §16.4: user ids with access to the active folder/group context — friend rings glow */
  highlightIds?: Set<string>;
  onAvatarClick: (id: string, type: 'me' | 'friend' | 'group') => void;
  onFriendLongPress?: (item: BottomBarItem) => void;
  onManage?: () => void;
  onNewGroup?: () => void;
}

export default function StoriesBar({
  items,
  highlightIds,
  onAvatarClick,
  onFriendLongPress,
  onManage,
  onNewGroup,
}: StoriesBarProps) {
  const friendId = useFilterStore((s) => s.friendId);
  const groupId = useFilterStore((s) => s.groupId);

  const meItem = items.find((i) => i.type === 'me');
  const friendItems = items.filter((i) => i.type === 'friend');
  const groupItems = items.filter((i) => i.type === 'group');

  const meActive = !friendId && !groupId;

  return (
    <div className="stories-bar">
      {meItem && (
        <div
          className="stories-me"
          role="button"
          tabIndex={0}
          aria-label="Me"
          onClick={() => onAvatarClick(meItem.id, 'me')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onAvatarClick(meItem.id, 'me');
            }
          }}
        >
          <div className={`story-ring${meActive ? ' active' : ''}`}>
            <div
              className="story-img"
              style={
                avatarUrl(meItem.avatarKey)
                  ? { backgroundImage: `url('${avatarUrl(meItem.avatarKey)}')` }
                  : {
                      background: meItem.bg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 14,
                    }
              }
            >
              {!avatarUrl(meItem.avatarKey) && meItem.initial}
            </div>
          </div>
          <div className="story-name">Me</div>
        </div>
      )}

      <div className="stories">
        {friendItems.map((item) => (
          <StoryItem
            key={item.id}
            item={item}
            isActive={friendId === item.id}
            hasAccess={highlightIds?.has(item.id)}
            onClick={onAvatarClick}
            onFriendLongPress={onFriendLongPress}
          />
        ))}
        {groupItems.map((item, gi) => (
          <StoryItem
            key={item.id}
            item={item}
            isActive={groupId === item.id}
            onClick={onAvatarClick}
            groupColorIndex={gi}
          />
        ))}
        <button
          type="button"
          className="story-add"
          onClick={onManage}
          aria-label="Manage friends"
        >
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <PlusIcon />
            <span style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>Manage</span>
          </span>
        </button>
        <button
          type="button"
          className="story-add"
          onClick={onNewGroup}
          aria-label="New group"
        >
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <PlusIcon />
            <span style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>New group</span>
          </span>
        </button>
      </div>
    </div>
  );
}

'use client';

import BottomBarAvatar, { BottomBarAvatarItem } from './BottomBarAvatar';
import { useDragPauseExpand } from '@/lib/dnd/useDragPauseExpand';

type BottomBarItem = BottomBarAvatarItem;

interface BottomBarProps {
  items: BottomBarItem[];
  onAvatarClick: (id: string, type: 'me' | 'friend' | 'group') => void;
  onExpandClick: () => void;
  /** When the strip is collapsed, a drag-hover >500ms auto-expands it (P7-T01). */
  isCollapsed?: boolean;
}

export default function BottomBar({ items, onAvatarClick, onExpandClick, isCollapsed = true }: BottomBarProps) {
  // Wire the drag-pause auto-expand: if user hovers the bar while dragging
  // and pauses >500ms, call onExpandClick. No-op when not collapsed.
  const autoExpandRef = useDragPauseExpand<HTMLDivElement>({
    isCollapsed,
    onExpand: onExpandClick,
    delayMs: 500,
  });

  return (
    <div className="lg:hidden">
    <div
      ref={autoExpandRef}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        flexShrink: 0,
        background: 'var(--surface-2)',
        borderTop: '1px solid var(--border-1)',
        transition: 'height 200ms ease',
      }}
    >
      <style>{`.liked-friends-strip::-webkit-scrollbar { display: none; }`}</style>

      {/* Expand handle */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          padding: '4px 0 6px',
          color: 'var(--text-3)',
          cursor: 'grab',
          userSelect: 'none',
        }}
        onClick={onExpandClick}
      >
        <div
          style={{
            width: 36,
            height: 3,
            background: 'var(--text-3)',
            opacity: 0.35,
            borderRadius: 100,
            marginBottom: 2,
          }}
        />
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
          }}
        >
          FRIENDS
        </span>
      </div>

      {/* Scrollable friends strip */}
      <div
        className="liked-friends-strip"
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          padding: '0 6px 12px',
          gap: 0,
        }}
      >
        {items.map((item) => (
          <BottomBarAvatar key={item.id} item={item} onClick={onAvatarClick} />
        ))}
      </div>
    </div>
    </div>
  );
}

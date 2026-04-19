'use client';

import { CSSProperties, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { targetId } from '@/lib/dnd/types';
import { useDndState } from '@/lib/dnd/DndProvider';

interface TopBarProps {
  notificationCount: number;
  userId: string;
  avatarKey: string | null;
  displayName: string;
  onFilterClick: () => void;
  onNotificationClick: () => void;
  onProfileClick: () => void;
  /** Optional: clicking the trash icon navigates to the trash view (P7-T04). */
  onTrashClick?: () => void;
  /** Soft-deleted node count → badge on trash icon (P7-T04, PRD §20.1). */
  trashCount?: number;
}

const iconBtnBase: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 12,
  background: 'var(--surface-3)',
  border: '1px solid var(--border-1)',
  color: 'var(--text-2)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  position: 'relative',
  cursor: 'pointer',
  flexShrink: 0,
  padding: 0,
};

function IconBtn({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      style={{
        ...iconBtnBase,
        background: hovered ? 'var(--surface-4)' : 'var(--surface-3)',
        color: hovered ? 'var(--text-1)' : 'var(--text-2)',
        transform: pressed ? 'scale(0.92)' : undefined,
        transition: 'background 0.15s, color 0.15s, transform 0.1s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
    >
      {children}
    </button>
  );
}

/** Trash icon with droppable zone for Node → Trash (P7-T01) + count badge (P7-T04). */
function TrashDropButton({ onClick, count = 0 }: { onClick?: () => void; count?: number }) {
  const { activeSource } = useDndState();
  const isDraggingNode = activeSource?.kind === 'node';
  const { setNodeRef, isOver } = useDroppable({
    id: targetId({ kind: 'trash' }),
    data: { dropTarget: { kind: 'trash' } },
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick ?? (() => {})}
      aria-label={count > 0 ? `Trash (${count} items)` : 'Trash'}
      style={{
        ...iconBtnBase,
        position: 'relative',
        background: isOver ? 'var(--red, #dc2626)' : isDraggingNode ? 'var(--surface-4)' : 'var(--surface-3)',
        color: isOver ? '#fff' : 'var(--text-2)',
        transform: isOver ? 'scale(1.08)' : undefined,
        transition: 'background 0.12s, transform 0.12s',
        outline: isDraggingNode && !isOver ? '2px dashed var(--border-1)' : 'none',
      }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
        <path d="M10 11v6" />
        <path d="M14 11v6" />
        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      </svg>
      {count > 0 && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            borderRadius: 8,
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
            fontSize: 10,
            fontWeight: 700,
            lineHeight: '16px',
            textAlign: 'center',
            border: '1.5px solid var(--surface-2)',
          }}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

export default function TopBar({
  notificationCount,
  displayName,
  onFilterClick,
  onNotificationClick,
  onProfileClick,
  onTrashClick,
  trashCount = 0,
}: TopBarProps) {
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        background: 'var(--surface-2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 16px 10px',
      }}
    >
      {/* Wordmark */}
      <span
        className="font-serif"
        style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}
      >
        <span style={{ color: 'var(--text-1)' }}>liked</span>
        <span style={{ color: 'var(--accent)' }}>.</span>
      </span>

      {/* Right group */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Sliders / Filter */}
        <IconBtn onClick={onFilterClick} label="Filter feed">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="4" y1="6" x2="20" y2="6" />
            <line x1="4" y1="12" x2="20" y2="12" />
            <line x1="4" y1="18" x2="20" y2="18" />
            <circle cx="9" cy="6" r="2.5" fill="var(--surface-3)" />
            <circle cx="15" cy="12" r="2.5" fill="var(--surface-3)" />
            <circle cx="9" cy="18" r="2.5" fill="var(--surface-3)" />
          </svg>
        </IconBtn>

        {/* Bell */}
        <IconBtn onClick={onNotificationClick} label="Notifications">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {notificationCount > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -3,
                right: -3,
                minWidth: 14,
                height: 14,
                padding: '0 4px',
                borderRadius: 100,
                background: 'var(--red)',
                color: '#fff',
                fontSize: 9,
                fontWeight: 700,
                border: '2px solid var(--surface-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          )}
        </IconBtn>

        {/* Trash drop zone + shortcut to trash view */}
        <TrashDropButton onClick={onTrashClick} count={trashCount} />

        {/* Avatar */}
        <button
          type="button"
          onClick={onProfileClick}
          aria-label="Profile"
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent), var(--red))',
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            border: '2px solid var(--surface-4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            padding: 0,
          }}
        >
          {initials}
        </button>
      </div>
    </header>
  );
}

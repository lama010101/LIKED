'use client';

import { CSSProperties, useState, useRef, useEffect, useMemo } from 'react';
import { useDroppable, useDndContext } from '@dnd-kit/core';
import { targetId } from '@/lib/dnd/types';
import { useFilterStore } from '@/lib/store/filterStore';
import { useSearchController } from '@/lib/hooks/useSearchController';

interface TopBarProps {
  notificationCount: number;
  userId: string;
  avatarKey: string | null;
  displayName: string;
  /** User's language code for search (e.g., 'en', 'fr', 'th') */
  languageCode?: string;
  onNotificationClick: () => void;
  onProfileClick: () => void;
  /** Optional: clicking the trash icon navigates to the trash view (P7-T04). */
  onTrashClick?: () => void;
  /** Soft-deleted node count → badge on trash icon (P7-T04, PRD §20.1). */
  trashCount?: number;
  /** When provided, renders Folder View Header (PRD §11.5a) instead of wordmark. */
  folderName?: string;
  folderColor?: string;
  onBackClick?: () => void;
  /** Active tag count badge on Tags icon (PRD §11.3f). */
  activeTagCount?: number;
  onTagsClick?: () => void;
}

const iconBtnBase: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 'var(--r-md)',
  background: 'var(--surface-1)',
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
        background: hovered ? 'var(--surface-2)' : 'var(--surface-1)',
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
  const { active } = useDndContext();
  const activeSource = active?.data?.current?.dragSource;
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
        <span className="badge" aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}

/**
 * Expandable search input using useSearchController
 * P9-T04: Search Input System
 *
 * - Debounced via useDebouncedSearch (300ms)
 * - Normalized via normalizeSearch from feedParams.ts
 * - URL sync via existing useFeedURLSync
 * - Empty input → null (removes search from URL)
 */
function SearchInput() {
  const [isExpanded, setIsExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Use search controller for debounced, normalized search
  const { inputValue, setInputValue, clearSearch } = useSearchController({
    debounceMs: 300,
  });

  // Focus input when expanded
  useEffect(() => {
    if (isExpanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isExpanded]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleClear = () => {
    clearSearch();
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const handleBlur = () => {
    // Collapse if empty
    if (!inputValue.trim()) {
      setIsExpanded(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      clearSearch();
      setIsExpanded(false);
    }
  };

  if (!isExpanded) {
    // Icon-only state (PRD §11.1: search icon-btn, tap to expand)
    return (
      <IconBtn onClick={() => setIsExpanded(true)} label="Search">
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
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </IconBtn>
    );
  }

  // Expanded state: full input
  return (
    <div
      className="search-field"
      style={{
        flex: 1,
        maxWidth: 240,
        height: 40,
      }}
    >
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
        style={{ color: 'var(--text-3)', flexShrink: 0 }}
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Search..."
        style={{
          flex: 1,
          background: 'transparent',
          border: 'none',
          outline: 'none',
          fontSize: 14,
          color: 'var(--text-1)',
          minWidth: 0,
        }}
        aria-label="Search cards"
      />
      {inputValue && (
        <button
          type="button"
          onMouseDown={(e) => {
            // Prevent blur before click
            e.preventDefault();
            handleClear();
          }}
          aria-label="Clear search"
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'var(--surface-4)',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            flexShrink: 0,
            padding: 0,
            color: 'var(--text-3)',
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * Filter status indicator with clear button
 * P9-T05: Filter State Control System
 *
 * - Shows active filter count badge
 * - Clear button visible only when filters active
 * - Clicking clear resets all filters (preserves view/sort)
 */
function FilterStatus() {
  const tagIdsLength = useFilterStore((s) => s.tagIds.length);
  const filterFriendIdsLength = useFilterStore((s) => s.filterFriendIds.length);
  const filterFolderIdsLength = useFilterStore((s) => s.filterFolderIds.length);
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const clearFilters = useFilterStore((s) => s.clearFilters);

  const hasActiveFilters = useMemo(() => {
    return (
      tagIdsLength > 0 ||
      filterFriendIdsLength > 0 ||
      filterFolderIdsLength > 0 ||
      searchQuery !== null
    );
  }, [tagIdsLength, filterFriendIdsLength, filterFolderIdsLength, searchQuery]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (tagIdsLength > 0) count++;
    if (filterFriendIdsLength > 0) count++;
    if (filterFolderIdsLength > 0) count++;
    if (searchQuery !== null) count++;
    return count;
  }, [tagIdsLength, filterFriendIdsLength, filterFolderIdsLength, searchQuery]);

  if (!hasActiveFilters) {
    return null;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {/* Active filter count badge */}
      <span
        style={{
          minWidth: 18,
          height: 18,
          padding: '0 5px',
          borderRadius: 100,
          background: 'var(--accent)',
          color: '#fff',
          fontSize: 10,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
        aria-label={`${activeFilterCount} active filters`}
      >
        {activeFilterCount}
      </span>

      {/* Clear filters button */}
      <button
        type="button"
        onClick={clearFilters}
        aria-label="Clear all filters"
        style={{
          ...iconBtnBase,
          width: 28,
          height: 28,
          borderRadius: 8,
        }}
        title="Clear filters"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export default function TopBar({
  notificationCount,
  displayName,
  onNotificationClick,
  onProfileClick,
  onTrashClick,
  trashCount = 0,
  folderName,
  folderColor,
  onBackClick,
  activeTagCount = 0,
  onTagsClick,
}: TopBarProps) {
  const initials = displayName.slice(0, 2).toUpperCase();
  const isFolderHeader = !!folderName;

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 'var(--space-sm) var(--space-lg) 4px',
        zIndex: 'var(--z-top-bar)',
        gap: 'var(--space-sm)',
      }}
    >
      {isFolderHeader ? (
        /* ── Folder View Header (PRD §11.5a) ── */
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <button
            type="button"
            onClick={onBackClick}
            aria-label="Back"
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--r-md)',
              background: 'var(--surface-3)',
              border: '1px solid var(--border-1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'transform var(--transition-fast), background var(--transition-fast)',
              flexShrink: 0,
              color: 'var(--text-1)',
              padding: 0,
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          {folderColor && (
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: folderColor,
                flexShrink: 0,
              }}
            />
          )}
          <span
            className="font-serif"
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: 'var(--text-1)',
              letterSpacing: '-0.02em',
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: 200,
            }}
          >
            {folderName}
          </span>
        </div>
      ) : (
        /* ── Wordmark ── */
        <span
          className="font-serif"
          style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-1.5px', lineHeight: 1 }}
        >
          <span style={{ color: 'var(--text-1)' }}>liked</span>
          <span style={{ color: 'var(--accent)' }}>.</span>
        </span>
      )}

      {/* Right group */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Tags icon (P9-T03 / Phase 4) */}
        <IconBtn onClick={onTagsClick ?? (() => {})} label="Tags">
          <div style={{ position: 'relative' }}>
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
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
            {activeTagCount > 0 && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: -5,
                  right: -6,
                  minWidth: 14,
                  height: 14,
                  padding: '0 3px',
                  borderRadius: 'var(--r-full)',
                  background: 'var(--accent)',
                  color: 'var(--accent-ink)',
                  fontSize: 9,
                  fontWeight: 700,
                  lineHeight: '14px',
                  textAlign: 'center',
                  border: '1.5px solid var(--surface-2)',
                }}
              >
                {activeTagCount > 99 ? '99+' : activeTagCount}
              </span>
            )}
          </div>
        </IconBtn>

        {/* Search (P9-T02: icon-only → expandable input) */}
        <SearchInput />

        {/* Filter status + clear (P9-T05) */}
        <FilterStatus />

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

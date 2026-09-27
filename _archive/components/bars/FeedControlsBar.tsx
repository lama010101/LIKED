'use client';

/**
 * FeedControlsBar — PROTO V2 feed pill + view controls (UIX-PORT-00 / UIX-06).
 * Replaces FeedTabs + MineSubTabs + SortViewRow.
 *
 * Feed pill dropdown (proto renderFeedDropdown):
 * - me/group/folder context: Created & Received · I created ▸{Private &
 *   Shared | Private | Shared} · I received
 * - friend context: {name} & me · I sent to {name} · I received from {name}
 * Maps to existing filterStore actions only:
 *   view + mineSubTab + friendId/groupId/folderId (context unchanged here).
 * NOTE: mineSubTab children bind to the existing (currently dead) store
 * field — get_feed has no private/shared param (pre-existing AUDIT-02 gap).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useFilterStore, SortOption } from '@/lib/store/filterStore';
import { getFriendBarAction, getGroupBarAction } from '@/app/lib/actions/session';

type FeedKey =
  | 'all'
  | 'created-all'
  | 'created-private'
  | 'created-shared'
  | 'received'
  | 'shared'
  | 'sent';

interface FeedOption {
  key: FeedKey;
  label: string;
  color: string;
  icon: React.ReactNode;
  expandable?: boolean;
  children?: FeedOption[];
}

const iconGrid = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" />
  </svg>
);
const iconPerson = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="12" cy="8" r="4" /><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
  </svg>
);
const iconLock = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);
const iconShare = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);
const iconShareNodes = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="18" cy="6" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="18" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);
const iconInbox = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M22 12h-6l-2 3H8l-2-3H2" />
    <path d="M5.55 5.55L2 12v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4l-3.55-6.45A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.69.96z" />
  </svg>
);
const iconArrowRight = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
  </svg>
);
const iconFolder = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const meOptions: FeedOption[] = [
  { key: 'all', label: 'Created & Received', color: 'var(--blue)', icon: iconGrid },
  {
    key: 'created-all',
    label: 'I created',
    color: 'var(--accent)',
    icon: iconPerson,
    expandable: true,
    children: [
      { key: 'created-all', label: 'Private & Shared', color: 'var(--accent)', icon: iconPerson },
      { key: 'created-private', label: 'Private', color: 'var(--orange)', icon: iconLock },
      { key: 'created-shared', label: 'Shared', color: 'var(--purple)', icon: iconShare },
    ],
  },
  { key: 'received', label: 'I received', color: 'var(--green)', icon: iconInbox },
];

function friendOptions(name: string): FeedOption[] {
  return [
    { key: 'shared', label: `${name} & me`, color: 'var(--purple)', icon: iconShareNodes },
    { key: 'sent', label: `I sent to ${name}`, color: 'var(--orange)', icon: iconArrowRight },
    { key: 'received', label: `I received from ${name}`, color: 'var(--green)', icon: iconInbox },
  ];
}

const viewModes: { id: 'col' | 'mason' | 'list' | 'horiz' | 'free'; icon: React.ReactNode }[] = [
  {
    id: 'col',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="7" height="7" x="3" y="3" rx="1" /><rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="14" rx="1" /><rect width="7" height="7" x="3" y="14" rx="1" />
      </svg>
    ),
  },
  {
    id: 'mason',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="6" height="20" x="4" y="2" rx="1" /><rect width="6" height="20" x="14" y="2" rx="1" />
      </svg>
    ),
  },
  {
    id: 'list',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    id: 'horiz',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect width="20" height="4" x="2" y="4" rx="1" /><rect width="16" height="4" x="2" y="10" rx="1" /><rect width="20" height="4" x="2" y="16" rx="1" />
      </svg>
    ),
  },
  {
    id: 'free',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 3H5a2 2 0 0 0-2 2v3" /><path d="M21 8V5a2 2 0 0 0-2-2h-3" />
        <path d="M3 16v3a2 2 0 0 0 2 2h3" /><path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      </svg>
    ),
  },
];

const SORT_OPTIONS: { id: SortOption; label: string }[] = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'most_shared', label: 'Most shared' },
  { id: 'highest_rated', label: 'Highest rated' },
  { id: 'custom', label: 'Custom' },
];

const SortIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m3 16 4 4 4-4" /><path d="M7 20V4" /><path d="m21 8-4-4-4 4" /><path d="M17 4v16" />
  </svg>
);

const ChevronDown = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const ChevronUp = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

interface FeedControlsBarProps {
  folderName?: string | null;
  folderColor?: string | null;
}

export default function FeedControlsBar({ folderName, folderColor }: FeedControlsBarProps) {
  const view = useFilterStore((s) => s.view);
  const mineSubTab = useFilterStore((s) => s.mineSubTab);
  const friendId = useFilterStore((s) => s.friendId);
  const groupId = useFilterStore((s) => s.groupId);
  const folderId = useFilterStore((s) => s.folderId);
  const viewMode = useFilterStore((s) => s.viewMode);
  const zoom = useFilterStore((s) => s.zoom);
  const sort = useFilterStore((s) => s.sort);
  const setView = useFilterStore((s) => s.setView);
  const setMineSubTab = useFilterStore((s) => s.setMineSubTab);
  const setViewMode = useFilterStore((s) => s.setViewMode);
  const setZoom = useFilterStore((s) => s.setZoom);
  const setSort = useFilterStore((s) => s.setSort);

  const [menuOpen, setMenuOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [createdExpanded, setCreatedExpanded] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [sortPos, setSortPos] = useState<{ top: number; left: number } | null>(null);
  const pillRef = useRef<HTMLButtonElement | null>(null);
  const sortBtnRef = useRef<HTMLButtonElement | null>(null);
  const [friendName, setFriendName] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string | null>(null);

  // Resolve friend/group display names for the pill label + menu labels.
  useEffect(() => {
    let cancelled = false;
    if (friendId) {
      getFriendBarAction().then((rows) => {
        if (cancelled) return;
        const f = rows.find((r) => r.user_id === friendId);
        setFriendName(f?.display_name ?? f?.to_email ?? 'Friend');
      });
    }
    if (groupId) {
      getGroupBarAction().then((rows) => {
        if (cancelled) return;
        const g = rows.find((r) => r.id === groupId);
        setGroupName(g?.name ?? 'Group');
      });
    }
    return () => {
      cancelled = true;
    };
  }, [friendId, groupId]);

  const closeMenus = useCallback(() => {
    setMenuOpen(false);
    setSortOpen(false);
  }, []);

  useEffect(() => {
    if (!menuOpen && !sortOpen) return;
    const onDocClick = () => closeMenus();
    const onScroll = () => closeMenus();
    document.addEventListener('click', onDocClick);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('click', onDocClick);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [menuOpen, sortOpen, closeMenus]);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (menuOpen) {
      setMenuOpen(false);
      return;
    }
    const rect = pillRef.current?.getBoundingClientRect();
    if (rect) setMenuPos({ top: rect.bottom + 6, left: rect.left });
    setSortOpen(false);
    setMenuOpen(true);
  };

  const toggleSort = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (sortOpen) {
      setSortOpen(false);
      return;
    }
    const rect = sortBtnRef.current?.getBoundingClientRect();
    if (rect) setSortPos({ top: rect.bottom + 6, left: rect.left });
    setMenuOpen(false);
    setSortOpen(true);
  };

  const pickFeed = (key: FeedKey) => {
    switch (key) {
      case 'all':
      case 'shared':
        setView('all');
        break;
      case 'received':
        setView('received');
        break;
      case 'sent':
        setView('mine');
        break;
      case 'created-all':
        setView('mine');
        setMineSubTab('all');
        break;
      case 'created-private':
        setView('mine');
        setMineSubTab('not_shared');
        break;
      case 'created-shared':
        setView('mine');
        setMineSubTab('shared');
        break;
    }
    if (key.startsWith('created')) setCreatedExpanded(true);
    setMenuOpen(false);
  };

  const activeKey: FeedKey = friendId
    ? view === 'mine'
      ? 'sent'
      : view === 'received'
        ? 'received'
        : 'shared'
    : view === 'mine'
      ? mineSubTab === 'not_shared'
        ? 'created-private'
        : mineSubTab === 'shared'
          ? 'created-shared'
          : 'created-all'
      : view === 'received'
        ? 'received'
        : 'all';

  const options: FeedOption[] = friendId ? friendOptions(friendName ?? 'them') : meOptions;
  const flatOptions = options.flatMap((o) => (o.children ? [o, ...o.children] : [o]));
  const activeOption = flatOptions.find((o) => o.key === activeKey) ?? options[0];

  const pillContent = folderId
    ? { color: folderColor ?? 'var(--text-3)', icon: iconFolder, label: folderName ?? 'Folder' }
    : groupId
      ? { color: 'var(--accent)', icon: iconShareNodes, label: groupName ?? 'Group' }
      : { color: activeOption.color, icon: activeOption.icon, label: activeOption.label };

  return (
    <div className="all-videos-header">
      <div className="all-videos-left">
        <div className="dropdown">
          <button
            type="button"
            ref={pillRef}
            className="filter-pill"
            onClick={toggleMenu}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <span className="icon-pill" style={{ background: pillContent.color }}>
              {pillContent.icon}
            </span>
            <span className="pill-label">{pillContent.label}</span>
            {ChevronDown}
          </button>
          {menuOpen && menuPos && (
            <div
              className="dropdown-menu"
              role="menu"
              style={{ top: menuPos.top, left: menuPos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              {options.map((o) =>
                o.expandable ? (
                  <div key={o.key}>
                    <div
                      className="dropdown-item parent"
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCreatedExpanded((v) => !v);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setCreatedExpanded((v) => !v);
                      }}
                    >
                      <span className="icon-pill" style={{ background: o.color }}>
                        {o.icon}
                      </span>
                      <span className="parent-label">{o.label}</span>
                      <span className="expand-arrow">{createdExpanded ? ChevronUp : ChevronDown}</span>
                    </div>
                    {createdExpanded && (
                      <div className="dropdown-children">
                        {o.children!.map((c) => (
                          <button
                            key={c.key}
                            type="button"
                            className={`dropdown-item sub${c.key === activeKey ? ' active' : ''}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              pickFeed(c.key);
                            }}
                          >
                            <span className="icon-pill" style={{ background: c.color }}>
                              {c.icon}
                            </span>
                            <span>{c.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    key={o.key}
                    type="button"
                    className={`dropdown-item${o.key === activeKey ? ' active' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      pickFeed(o.key);
                    }}
                  >
                    <span className="icon-pill" style={{ background: o.color }}>
                      {o.icon}
                    </span>
                    <span>{o.label}</span>
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>

      <div className="all-videos-right">
        <div className="dropdown">
          <button
            type="button"
            ref={sortBtnRef}
            className="filter-pill"
            onClick={toggleSort}
            aria-haspopup="menu"
            aria-expanded={sortOpen}
            style={{ gap: 6 }}
          >
            {SortIcon}
            <span className="pill-label">
              {SORT_OPTIONS.find((s) => s.id === sort)?.label ?? 'Newest'}
            </span>
            {ChevronDown}
          </button>
          {sortOpen && sortPos && (
            <div
              className="dropdown-menu"
              role="menu"
              style={{ top: sortPos.top, left: sortPos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              {SORT_OPTIONS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`dropdown-item${s.id === sort ? ' active' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSort(s.id);
                    setSortOpen(false);
                  }}
                >
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="view-toggle">
          {viewModes.map(({ id, icon }) => {
            const isActive = viewMode === id;
            return (
              <button
                key={id}
                type="button"
                aria-label={`${id} view`}
                aria-pressed={isActive}
                className={isActive ? 'active' : ''}
                onClick={() => setViewMode(id)}
              >
                {icon}
              </button>
            );
          })}
        </div>

        {viewMode === 'col' && (
          <div className="cols-control">
            <span className="cols-label">Columns</span>
            <div className="cols-stepper">
              <button
                type="button"
                onClick={() => setZoom(Math.max(2, zoom - 1))}
                aria-label="fewer columns"
              >
                &minus;
              </button>
              <span className="cols-value">{zoom}</span>
              <button
                type="button"
                onClick={() => setZoom(Math.min(6, zoom + 1))}
                aria-label="more columns"
              >
                +
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

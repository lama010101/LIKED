'use client';

import { TabId } from './FeedTabs';
import { MineSubTab } from './MineSubTabs';
import { ViewMode } from './SortViewRow';

interface DesktopToolbarProps {
  tab: TabId;
  onTabChange: (tab: TabId) => void;
  mineSubTab?: MineSubTab;
  onMineSubTabChange?: (subTab: MineSubTab) => void;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  zoom?: number;
  onZoomChange?: (zoom: number) => void;
  sortLabel?: string;
  onSortClick?: () => void;
  notificationCount?: number;
  onNotificationClick?: () => void;
  isInFolder?: boolean;
  folderName?: string;
  onBackClick?: () => void;
  className?: string;
  onProfileClick?: () => void;
  userDisplayName?: string;
}

const tabs = [
  { id: 'all' as TabId, label: 'All' },
  { id: 'mine' as TabId, label: 'Mine' },
  { id: 'received' as TabId, label: 'Received' },
];

const subTabs = [
  { id: 'all' as MineSubTab, label: 'All' },
  { id: 'not-shared' as MineSubTab, label: 'Not shared' },
  { id: 'shared' as MineSubTab, label: 'Shared' },
];

const SortIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 16 4 4 4-4" />
    <path d="M7 20V4" />
    <path d="m21 8-4-4-4 4" />
    <path d="M17 4v16" />
  </svg>
);

const SearchIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const BellIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const ZoomOutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const ZoomInIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const viewModes: { id: ViewMode; icon: React.FC }[] = [
  {
    id: 'col',
    icon: () => (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="7" height="7" x="3" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="14" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" />
      </svg>
    ),
  },
  {
    id: 'mason',
    icon: () => (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="6" height="20" x="4" y="2" rx="1" />
        <rect width="6" height="20" x="14" y="2" rx="1" />
      </svg>
    ),
  },
  {
    id: 'list',
    icon: () => (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    id: 'horiz',
    icon: () => (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="4" x="2" y="4" rx="1" />
        <rect width="16" height="4" x="2" y="10" rx="1" />
        <rect width="20" height="4" x="2" y="16" rx="1" />
      </svg>
    ),
  },
  {
    id: 'free',
    icon: () => (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3H5a2 2 0 0 0-2 2v3" />
        <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
        <path d="M3 16v3a2 2 0 0 0 2 2h3" />
        <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      </svg>
    ),
  },
];

export default function DesktopToolbar({
  tab,
  onTabChange,
  mineSubTab,
  onMineSubTabChange,
  view,
  onViewChange,
  zoom,
  onZoomChange,
  sortLabel = 'Newest',
  onSortClick,
  notificationCount = 0,
  onNotificationClick,
  isInFolder,
  folderName,
  onBackClick,
  className,
  onProfileClick,
  userDisplayName,
}: DesktopToolbarProps) {
  const initials = userDisplayName ? userDisplayName.slice(0, 2).toUpperCase() : '';
  return (
    <div
      className={className}
      style={{
        alignItems: 'center',
        gap: '10px',
        padding: '10px 18px',
        borderBottom: '1px solid var(--border-1)',
        background: 'var(--surface-2)',
        flexShrink: 0,
      }}
    >
      {/* Left: folder header or feed tabs */}
      {isInFolder ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {onBackClick && (
            <button
              type="button"
              onClick={onBackClick}
              style={{
                width: '30px',
                height: '30px',
                background: 'var(--surface-3)',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                color: 'var(--text-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          )}
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>
            {folderName || 'Folder'}
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          {tabs.map((t) => {
            const isActive = tab === t.id;
            const activeBg =
              t.id === 'all'
                ? 'rgba(176,179,192,0.1)'
                : t.id === 'mine'
                ? 'rgba(245,166,35,0.1)'
                : 'rgba(96,197,241,0.1)';
            const activeColor =
              t.id === 'all' ? 'var(--text-2)' : t.id === 'mine' ? 'var(--accent)' : 'var(--blue)';
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTabChange(t.id)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '8px',
                  fontSize: 11,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? activeColor : 'var(--text-3)',
                  background: isActive ? activeBg : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'all .12s',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--surface-3)';
                    e.currentTarget.style.color = 'var(--text-2)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-3)';
                  }
                }}
              >
                {t.label}
              </button>
            );
          })}
          {tab === 'mine' && mineSubTab !== undefined && onMineSubTabChange && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginLeft: '8px' }}>
              {subTabs.map((st) => {
                const isActive = mineSubTab === st.id;
                const activeColor =
                  st.id === 'all' ? 'var(--tab-mine)' : st.id === 'not-shared' ? '#ff7a45' : '#14b8a6';
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => onMineSubTabChange(st.id)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '5px 11px',
                      border: `1px solid ${isActive ? activeColor : 'var(--border-1)'}`,
                      background: isActive ? activeColor : 'var(--surface-1)',
                      borderRadius: 'var(--r-full)',
                      fontSize: 11,
                      fontWeight: isActive ? 700 : 600,
                      color: isActive ? '#fff' : activeColor,
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {st.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Right: controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Search trigger */}
        <button
          type="button"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 11px',
            background: 'var(--surface-2)',
            borderRadius: '8px',
            fontSize: 11,
            color: 'var(--text-3)',
            border: '1px solid var(--border-1)',
            cursor: 'pointer',
          }}
        >
          <SearchIcon />
          <span>Search</span>
        </button>

        {/* Sort */}
        <button
          type="button"
          onClick={onSortClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            padding: '6px 11px',
            background: 'var(--surface-2)',
            borderRadius: 'var(--r-md)',
            fontSize: 11,
            color: 'var(--text-2)',
            border: '1px solid var(--border-1)',
            cursor: 'pointer',
          }}
        >
          <SortIcon />
          <span>{sortLabel}</span>
        </button>

        {/* Zoom stepper — only in col view */}
        {view === 'col' && zoom !== undefined && onZoomChange && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '2px',
              padding: '3px',
              background: 'var(--surface-2)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border-1)',
            }}
          >
            <button
              type="button"
              onClick={() => onZoomChange(Math.max(2, zoom - 1))}
              style={{
                width: '26px',
                height: '26px',
                borderRadius: 'var(--r-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-2)',
                transition: 'background var(--transition-fast)',
              }}
            >
              <ZoomOutIcon />
            </button>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--text-2)',
                minWidth: '36px',
                textAlign: 'center',
              }}
            >
              {zoom} col
            </span>
            <button
              type="button"
              onClick={() => onZoomChange(Math.min(6, zoom + 1))}
              style={{
                width: '26px',
                height: '26px',
                borderRadius: 'var(--r-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-2)',
                transition: 'background var(--transition-fast)',
              }}
            >
              <ZoomInIcon />
            </button>
          </div>
        )}

        {/* View switcher */}
        <div
          style={{
            display: 'flex',
            gap: '2px',
            padding: '2px',
            background: 'var(--surface-2)',
            borderRadius: '9px',
          }}
        >
          {viewModes.map(({ id, icon: Icon }) => {
            const isActive = view === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onViewChange(id)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '7px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: 'none',
                  background: isActive ? 'var(--surface-3)' : 'transparent',
                  color: isActive ? 'var(--text-1)' : 'var(--text-3)',
                  transition: 'background var(--transition-fast), color var(--transition-fast)',
                }}
              >
                <Icon />
              </button>
            );
          })}
        </div>

        {/* Notification bell */}
        <button
          type="button"
          onClick={onNotificationClick}
          style={{
            width: '32px',
            height: '32px',
            background: 'var(--surface-2)',
            borderRadius: 'var(--r-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-2)',
            border: '1px solid var(--border-1)',
            position: 'relative',
            cursor: 'pointer',
          }}
        >
          <BellIcon />
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
              }}
            >
              {notificationCount > 99 ? '99+' : notificationCount}
            </span>
          )}
        </button>

        {/* Avatar */}
        {onProfileClick && (
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
        )}
      </div>
    </div>
  );
}

'use client';

import { CSSProperties } from 'react';

interface SidebarItem {
  id: string;
  type: 'me' | 'friend' | 'group';
  displayName: string;
  initial: string;
  bg: string;
  hasNew?: boolean;
}

interface DesktopSidebarProps {
  items: SidebarItem[];
  displayName: string;
}

const sectionLabelStyle: CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--text-3)',
  padding: '12px 14px 6px',
};

const navItemBase: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '8px 12px',
  margin: '0 8px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  border: 'none',
  background: 'transparent',
  color: 'var(--text-2)',
  textAlign: 'left',
  width: 'calc(100% - 16px)',
};

function SearchIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export default function DesktopSidebar({ items, displayName }: DesktopSidebarProps) {
  const friends = items.filter((i) => i.type === 'friend');
  const groups = items.filter((i) => i.type === 'group');
  const initials = displayName.slice(0, 2).toUpperCase();

  return (
    <aside
      style={{
        width: 220,
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface-2)',
        borderRight: '1px solid var(--border-1)',
        overflowY: 'auto',
        flexShrink: 0,
      }}
    >
      {/* Wordmark */}
      <div style={{ padding: '14px 16px 10px' }}>
        <span
          className="font-serif"
          style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1 }}
        >
          <span style={{ color: 'var(--text-1)' }}>liked</span>
          <span style={{ color: 'var(--accent)' }}>.</span>
        </span>
      </div>

      {/* Search bar stub */}
      <div style={{ padding: '0 12px 10px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '7px 10px',
            background: 'var(--surface-3)',
            border: '1px solid var(--border-1)',
            borderRadius: 8,
            color: 'var(--text-3)',
            fontSize: 12,
          }}
        >
          <SearchIcon />
          <span>Search…</span>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4 }}>
        <button
          type="button"
          style={{
            ...navItemBase,
            background: 'var(--surface-3)',
            color: 'var(--accent)',
            border: '1px solid var(--border-1)',
          }}
        >
          <HomeIcon />
          <span>Feed</span>
        </button>
        <button type="button" style={navItemBase}>
          <FolderIcon />
          <span>Folders</span>
        </button>
        <button type="button" style={navItemBase}>
          <TrashIcon />
          <span>Trash</span>
        </button>
      </nav>

      {/* Friends section */}
      <div style={sectionLabelStyle}>Friends</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {friends.map((f) => (
          <button
            key={f.id}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '5px 14px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-2)',
              fontSize: 12,
              textAlign: 'left',
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: f.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: '#fff',
                flexShrink: 0,
              }}
            >
              {f.initial}
            </div>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {f.displayName}
            </span>
            {f.hasNew && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  flexShrink: 0,
                }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Groups section */}
      <div style={sectionLabelStyle}>Groups</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '5px 14px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-2)',
              fontSize: 12,
              textAlign: 'left',
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 5,
                background: g.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: '#fff',
                flexShrink: 0,
              }}
            >
              {g.initial}
            </div>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {g.displayName}
            </span>
            {g.hasNew && (
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  flexShrink: 0,
                }}
              />
            )}
          </button>
        ))}
      </div>

      {/* User avatar row — pinned bottom */}
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          borderTop: '1px solid var(--border-1)',
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--accent), var(--red))',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-1)', fontWeight: 500 }}>{displayName}</span>
      </div>
    </aside>
  );
}

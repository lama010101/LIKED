'use client';

import { useEffect, useState } from 'react';
import TopBar from '@/components/bars/TopBar';
import BottomBar from '@/components/bars/BottomBar';
import AddCardSheet from '@/components/sheets/AddCardSheet';
import ProfileModal from '@/components/modals/ProfileModal';
import DesktopSidebar from '@/components/sidebar/DesktopSidebar';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';

const tabs = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'received', label: 'Received' },
] as const;

type TabId = typeof tabs[number]['id'];
type MineSubTab = 'all' | 'not-shared' | 'shared';
type ViewMode = 'col' | 'mason' | 'list' | 'free';

interface BottomBarItem {
  id: string;
  type: 'me' | 'friend' | 'group';
  displayName: string;
  initial: string;
  bg: string;
  hasNew?: boolean;
}

const stubItems: BottomBarItem[] = [
  { id: 'me', type: 'me', displayName: 'Me', initial: 'JS', bg: 'linear-gradient(135deg,#f5a623,#ff6b6b)' },
  { id: 'al', type: 'friend', displayName: 'Alice', initial: 'A', bg: 'linear-gradient(135deg,#4a9fd5,#1c6fa0)', hasNew: true },
  { id: 'bo', type: 'friend', displayName: 'Bob', initial: 'B', bg: 'linear-gradient(135deg,#d54a9f,#a01c6f)', hasNew: true },
  { id: 'ch', type: 'friend', displayName: 'Chiara', initial: 'C', bg: 'linear-gradient(135deg,#4ad58a,#1ca06f)' },
  { id: 'di', type: 'friend', displayName: 'Diego', initial: 'D', bg: 'linear-gradient(135deg,#d5a44a,#a07a1c)' },
  { id: 'g1', type: 'group', displayName: 'Music', initial: 'M', bg: 'linear-gradient(135deg,#3a5cd5,#1c3aa0)' },
];

// Inline SVG icons
const SortIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 16 4 4 4-4" />
    <path d="M7 20V4" />
    <path d="m21 8-4-4-4 4" />
    <path d="M17 4v16" />
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

const GridIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="7" height="7" x="3" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="3" rx="1" />
    <rect width="7" height="7" x="14" y="14" rx="1" />
    <rect width="7" height="7" x="3" y="14" rx="1" />
  </svg>
);

const MasonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="6" height="20" x="4" y="2" rx="1" />
    <rect width="6" height="20" x="14" y="2" rx="1" />
  </svg>
);

const ListIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const FreeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 3H5a2 2 0 0 0-2 2v3" />
    <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
    <path d="M3 16v3a2 2 0 0 0 2 2h3" />
    <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
  </svg>
);

const PlusIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14" />
    <path d="M12 5v14" />
  </svg>
);

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<TabId>('all');
  const [mineSubTab, setMineSubTab] = useState<MineSubTab>('all');
  const [view, setView] = useLocalStorage<ViewMode>('liked.view', 'col');
  const [zoom, setZoom] = useLocalStorage<number>('liked.zoom', 2);
  const [theme, setThemeState] = useLocalStorage<'dark' | 'light'>('liked.theme', 'dark');
  const [folderPath, setFolderPath] = useState<string[]>([]);
  const [openFriends, setOpenFriends] = useState(false);
  const [openFilter, setOpenFilter] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [openProfile, setOpenProfile] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState('JS');
  const [notificationCount] = useState(2);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleThemeChange = (t: 'dark' | 'light') => {
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t);
  };

  const isInFolder = folderPath.length > 0;

  const getTabActiveStyle = (tabId: TabId): React.CSSProperties => {
    const base: React.CSSProperties = {
      background: 'var(--surface-3)',
      borderColor: 'var(--border-1)',
    };
    if (tabId === 'all') return { ...base, color: 'var(--text-1)' };
    if (tabId === 'mine') return { ...base, color: 'var(--accent)' };
    return { ...base, color: '#60c5f1' };
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* DESKTOP SIDEBAR — hidden below lg */}
      <div className="hidden lg:flex" style={{ flexShrink: 0 }}>
        <DesktopSidebar items={stubItems} displayName="JS" />
      </div>

      {/* MAIN COLUMN */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
          minWidth: 0,
        }}
      >
      {/* TopBar — mobile only; desktop has wordmark in sidebar */}
      {!isInFolder && (
        <div className="lg:hidden">
        <TopBar
          notificationCount={notificationCount}
          userId="stub-user-id"
          avatarKey={null}
          displayName="JS"
          onFilterClick={() => setOpenFilter(true)}
          onNotificationClick={() => {}}
          onProfileClick={() => {}}
        />
        </div>
      )}

      {/* Feed filter tabs — hidden when in folder context */}
      {!isInFolder && (
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: '0 14px 8px',
            background: 'var(--surface-2)',
            flexShrink: 0,
          }}
        >
          {tabs.map((t) => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  flex: 1,
                  padding: '8px 6px',
                  textAlign: 'center',
                  fontSize: 12,
                  fontWeight: 600,
                  borderRadius: 10,
                  borderColor: 'transparent',
                  cursor: 'pointer',
                  transition: 'background .15s, color .15s',
                  background: isActive ? undefined : 'transparent',
                  color: isActive ? undefined : 'var(--text-3)',
                  ...(isActive ? getTabActiveStyle(t.id) : {}),
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Mine sub-tabs — only when tab === 'mine', hidden in folder context */}
      {!isInFolder && tab === 'mine' && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '0 14px 8px',
            background: 'var(--surface-2)',
            flexShrink: 0,
          }}
        >
          {[
            { id: 'all', label: 'All Mine' },
            { id: 'not-shared', label: 'Not shared' },
            { id: 'shared', label: 'Shared' },
          ].map((st) => {
            const isActive = mineSubTab === (st.id as MineSubTab);
            return (
              <button
                key={st.id}
                onClick={() => setMineSubTab(st.id as MineSubTab)}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '4px 10px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: isActive ? 'var(--surface-3)' : 'transparent',
                  color: isActive ? 'var(--accent)' : 'var(--text-3)',
                  border: isActive ? '1px solid var(--border-1)' : '1px solid transparent',
                }}
              >
                {st.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Context strip — stub: always hidden for now */}
      {/* activeFilters.length > 0 && <div>...</div> */}

      {/* Util bar — always visible, including inside folders */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '4px 14px 10px',
          background: 'var(--surface-2)',
          borderBottom: '1px solid var(--border-1)',
          flexShrink: 0,
        }}
      >
        {/* Left group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Sort button */}
          <button
            onClick={() => setOpenFilter(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '5px 10px',
              background: 'var(--surface-3)',
              border: '1px solid var(--border-1)',
              borderRadius: 8,
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text-2)',
              cursor: 'pointer',
            }}
          >
            <SortIcon />
            <span>Newest</span>
          </button>

          {/* Zoom pill — only when view === 'col' */}
          {view === 'col' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 8px',
                background: 'var(--surface-3)',
                border: '1px solid var(--border-1)',
                borderRadius: 8,
              }}
            >
              <button
                onClick={() => setZoom(Math.max(2, zoom - 1))}
                style={{
                  padding: 2,
                  cursor: 'pointer',
                  color: 'var(--text-2)',
                  background: 'transparent',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ZoomOutIcon />
              </button>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-2)',
                  minWidth: 32,
                  textAlign: 'center',
                }}
              >
                {zoom} col
              </span>
              <button
                onClick={() => setZoom(Math.min(6, zoom + 1))}
                style={{
                  padding: 2,
                  cursor: 'pointer',
                  color: 'var(--text-2)',
                  background: 'transparent',
                  border: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ZoomInIcon />
              </button>
            </div>
          )}
        </div>

        {/* Right group — view switch */}
        <div
          style={{
            display: 'flex',
            gap: 2,
            background: 'var(--surface-3)',
            border: '1px solid var(--border-1)',
            borderRadius: 9,
            padding: 2,
          }}
        >
          {([
            { id: 'col', icon: GridIcon },
            { id: 'mason', icon: MasonIcon },
            { id: 'list', icon: ListIcon },
            { id: 'free', icon: FreeIcon },
          ] as { id: ViewMode; icon: React.FC }[]).map(({ id, icon: Icon }) => {
            const isActive = view === id;
            return (
              <button
                key={id}
                onClick={() => setView(id)}
                style={{
                  width: 28,
                  height: 24,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  background: isActive ? 'var(--surface-4)' : 'transparent',
                  color: isActive ? 'var(--text-1)' : 'var(--text-3)',
                  border: 'none',
                  padding: 0,
                }}
              >
                <Icon />
              </button>
            );
          })}
        </div>
      </div>

      {/* Main content area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          background: 'var(--bg)',
          position: 'relative',
          minHeight: 0,
        }}
      >
        {children}
      </div>

      {/* Bottom area */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {/* FAB */}
        <button
          onClick={() => setOpenAdd(true)}
          className="lg:fixed lg:bottom-6 lg:right-6"
          style={{
            position: 'absolute',
            top: -21,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 42,
            height: 42,
            borderRadius: '50%',
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 16px rgba(245,166,35,0.5), 0 0 0 3px var(--surface-2)',
            cursor: 'pointer',
            zIndex: 10,
            border: 'none',
            padding: 0,
          }}
        >
          <PlusIcon />
        </button>

        {/* BottomBar */}
        <BottomBar
          items={stubItems}
          onExpandClick={() => setOpenFriends(true)}
          onAvatarClick={(id, type) => {
            if (type === 'me') setOpenProfile(true);
          }}
        />
      </div>

      </div>

      {/* Add Card Sheet */}
      <AddCardSheet open={openAdd} onClose={() => setOpenAdd(false)} />

      {/* Profile Modal */}
      <ProfileModal
        open={openProfile}
        onClose={() => setOpenProfile(false)}
        userId="stub-user-id"
        displayName={profileDisplayName}
        avatarKey={null}
        theme={theme}
        onThemeChange={handleThemeChange}
        onDisplayNameChange={(name) => setProfileDisplayName(name)}
      />
    </div>
  );
}

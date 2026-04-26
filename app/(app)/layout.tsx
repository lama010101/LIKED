'use client';

import { useEffect, useMemo, useState } from 'react';
import TopBar from '@/components/bars/TopBar';
import BottomBar from '@/components/bars/BottomBar';
import AddCardSheet from '@/components/sheets/AddCardSheet';
import AddFolderSheet from '@/components/sheets/AddFolderSheet';
import ProfileModal from '@/components/modals/ProfileModal';
import DesktopSidebar from '@/components/sidebar/DesktopSidebar';
import DndProvider from '@/lib/dnd/DndProvider';
import SelectionOverlay from '@/components/selection/SelectionOverlay';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';
import { getTrashCount } from '@/app/lib/actions/trash';
import { useFilterStore } from '@/lib/store/filterStore';
import { useFeedURLSync } from '@/lib/hooks/useFeedURLSync';
import FeedTabs, { TabId } from '@/components/bars/FeedTabs';
import MineSubTabs, { MineSubTab } from '@/components/bars/MineSubTabs';
import SortViewRow, { ViewMode } from '@/components/bars/SortViewRow';
import TagsStrip from '@/components/bars/TagsStrip';
import ContextStrip, { ContextPill } from '@/components/bars/ContextStrip';
import FabSpeedDial from '@/components/bars/FabSpeedDial';
import FolderPathBar from '@/components/bars/FolderPathBar';
import DesktopToolbar from '@/components/bars/DesktopToolbar';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    setIsMobile(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return isMobile;
}

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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  // P9-T03: Filter state from store (URL is source of truth via useFeedURLSync)
  useFeedURLSync();
  const filterView = useFilterStore((s) => s.view);
  const filterSort = useFilterStore((s) => s.sort);
  const setFilterView = useFilterStore((s) => s.setView);
  const setMineSubTabStore = useFilterStore((s) => s.setMineSubTab);
  const mineSubTabStore = useFilterStore((s) => s.mineSubTab);
  const tagIds = useFilterStore((s) => s.tagIds);
  const filterFriendIds = useFilterStore((s) => s.filterFriendIds);
  const filterFolderIds = useFilterStore((s) => s.filterFolderIds);
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const toggleTagFilter = useFilterStore((s) => s.toggleTagFilter);
  const toggleFriendFilter = useFilterStore((s) => s.toggleFriendFilter);
  const toggleFolderFilter = useFilterStore((s) => s.toggleFolderFilter);
  const setSearch = useFilterStore((s) => s.setSearch);
  const clearFilters = useFilterStore((s) => s.clearFilters);

  // Stub tag label lookup for Context Strip (until real tag data is wired)
  const tagLabelMap: Record<string, string> = {
    t1: 'Design', t2: 'Music', t3: 'Work', t4: 'Travel', t5: 'Food', t6: 'Read later', t7: 'Inspiration',
  };
  const tagColorMap: Record<string, string> = {
    t1: '#ef4444', t2: '#3b82f6', t3: '#22c55e', t4: '#f59e0b', t5: '#ec4899', t6: '#8b5cf6', t7: '#06b6d4',
  };

  // Build active-context pills for Context Strip (PRD §11.3g)
  const contextPills = useMemo<ContextPill[]>(() => {
    const pills: ContextPill[] = [];
    tagIds.forEach((id) => {
      pills.push({ id, type: 'tag', label: tagLabelMap[id] ?? id, color: tagColorMap[id] });
    });
    filterFriendIds.forEach((id) => {
      const friend = stubItems.find((s) => s.id === id);
      pills.push({ id, type: 'friend', label: friend?.displayName ?? id, avatar: friend?.bg });
    });
    filterFolderIds.forEach((id) => {
      pills.push({ id, type: 'folder', label: 'Folder' });
    });
    if (searchQuery) {
      pills.push({ id: 'search', type: 'search', label: `"${searchQuery}"` });
    }
    return pills;
  }, [tagIds, filterFriendIds, filterFolderIds, searchQuery]);

  // Map store view to layout TabId
  const tab = filterView as TabId;
  const setTab = (next: TabId) => {
    setFilterView(next as typeof filterView);
    if (next !== 'mine') setMineSubTabStore('all');
  };
  const mineSubTab = mineSubTabStore === 'not_shared' ? 'not-shared' : mineSubTabStore === 'shared' ? 'shared' : 'all';
  const setMineSubTab = (next: MineSubTab) => {
    setMineSubTabStore(next === 'not-shared' ? 'not_shared' : next === 'shared' ? 'shared' : 'all');
  };
  // View/zoom presentation state — read from shared Zustand store (reactive across components)
  const view = useFilterStore((s) => s.viewMode);
  const zoom = useFilterStore((s) => s.zoom);
  const setViewMode = useFilterStore((s) => s.setViewMode);
  const setZoom = useFilterStore((s) => s.setZoom);
  const [theme, setThemeState] = useLocalStorage<'dark' | 'light'>('liked.theme', 'dark');
  const [folderPath, setFolderPath] = useState<string[]>([]);
  const [friendsState, setFriendsState] = useLocalStorage<'hidden' | 'strip' | 'expanded'>('liked.friendsStripState', 'strip');
  const [tagsStripOpen, setTagsStripOpen] = useState(false);
  const [folderPathBarVisible, setFolderPathBarVisible] = useState(true);
  const [openFilter, setOpenFilter] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [openFolder, setOpenFolder] = useState(false);
  const [speedDialOpen, setSpeedDialOpen] = useState(false);
  const [openProfile, setOpenProfile] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState('JS');
  const [notificationCount] = useState(2);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);
  const [trashCount, setTrashCount] = useState<number>(0);
  const isMobile = useIsMobile();
  const router = useRouter();
  const pathname = usePathname();

  // Refresh the trash-icon badge count (PRD §20.1) whenever the route
  // changes, so restoring or leaving /trash reflects in the top bar.
  useEffect(() => {
    let cancelled = false;
    getTrashCount().then((n) => {
      if (!cancelled) setTrashCount(n);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, toast]);

  // Auto-hide toast after 2.2s
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const handleThemeChange = (t: 'dark' | 'light') => {
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t);
  };

  const isInFolder = folderPath.length > 0;

  return (
    <DndProvider>
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
      <div className="lg:hidden">
        <TopBar
          notificationCount={notificationCount}
          userId="stub-user-id"
          avatarKey={null}
          displayName="JS"
          onNotificationClick={() => {}}
          onProfileClick={() => setOpenProfile(true)}
          onTrashClick={() => router.push('/trash')}
          trashCount={trashCount}
          folderName={isInFolder ? 'Current Folder' : undefined}
          folderColor={isInFolder ? 'var(--accent)' : undefined}
          onBackClick={() => setFolderPath((p) => p.slice(0, -1))}
          activeTagCount={useFilterStore((s) => s.tagIds.length)}
          onTagsClick={() => setTagsStripOpen((v) => !v)}
        />
      </div>

      {/* Tags Strip — collapsible, between TopBar and feed tabs (PRD §11.3f) */}
      {tagsStripOpen && (
        <TagsStrip visible={tagsStripOpen} />
      )}

      {/* Desktop Toolbar — unified toolbar for lg+ screens (PRD §11.8) */}
      <DesktopToolbar
        className="hidden lg:flex"
        tab={tab}
        onTabChange={setTab}
        mineSubTab={mineSubTab}
        onMineSubTabChange={setMineSubTab}
        view={view}
        onViewChange={setViewMode}
        sortLabel="Newest"
        onSortClick={() => setOpenFilter(true)}
        notificationCount={notificationCount}
        onNotificationClick={() => {}}
        isInFolder={isInFolder}
        folderName={isInFolder ? 'Current Folder' : undefined}
        onBackClick={() => setFolderPath((p) => p.slice(0, -1))}
      />

      {/* Feed filter tabs — mobile only, hidden on desktop */}
      <div className="lg:hidden">
        {!isInFolder && (
          <FeedTabs activeTab={tab} onTabChange={setTab} />
        )}
      </div>

      {/* Mine sub-tabs — mobile only, hidden on desktop */}
      <div className="lg:hidden">
        {!isInFolder && tab === 'mine' && (
          <MineSubTabs activeSubTab={mineSubTab} onSubTabChange={setMineSubTab} scope="mine" />
        )}
      </div>

      {/* Context Strip — active filter pills (PRD §11.3g) — mobile only, desktop filters in sidebar */}
      <div className="lg:hidden">
      <ContextStrip
        pills={contextPills}
        onRemove={(id, type) => {
          if (type === 'tag') toggleTagFilter(id);
          else if (type === 'friend') toggleFriendFilter(id);
          else if (type === 'folder') toggleFolderFilter(id);
          else if (type === 'search') setSearch(null);
        }}
        onClearAll={clearFilters}
      />
      </div>

      {/* Sort / View Row — mobile only, hidden on desktop (unified in DesktopToolbar) */}
      <div className="lg:hidden">
        <SortViewRow
          view={view}
          onViewChange={setViewMode}
          zoom={zoom}
          onZoomChange={setZoom}
          sortLabel="Newest"
          onSortClick={() => setOpenFilter(true)}
        />
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

      {/* Bottom area — prototype: sticky bottom container with FAB overlapping */}
      <div className="bottom-area">
        {/* FAB Speed-Dial (PRD §11.3) */}
        <FabSpeedDial
          open={speedDialOpen}
          onToggle={() => setSpeedDialOpen((v) => !v)}
          onAction={(id) => {
            setSpeedDialOpen(false);
            if (id === 'card') setOpenAdd(true);
            else if (id === 'folder') setOpenFolder(true);
            else setToast({ kind: 'ok', message: 'Coming soon' });
          }}
        />

        {/* Bottom dock: folders + friends (PRD §11.8) */}
        <div className="bottom-dock lg:hidden">
          {/* Folder Path Bar — always visible in bottom dock */}
          {friendsState !== 'expanded' && (
            <FolderPathBar
              path={folderPath.map((id, i) => ({ id, name: `Folder ${i + 1}`, count: i === folderPath.length - 1 ? 12 : undefined }))}
              totalCount={12}
              onNavigate={(id) => {
                if (id === 'root') setFolderPath([]);
                else {
                  const idx = folderPath.indexOf(id);
                  if (idx >= 0) setFolderPath(folderPath.slice(0, idx + 1));
                }
              }}
              onBack={() => setFolderPath((p) => p.slice(0, -1))}
              visible={folderPathBarVisible}
              onToggleVisibility={() => setFolderPathBarVisible((v) => !v)}
            />
          )}

          {/* BottomBar */}
          <BottomBar
          items={stubItems}
          state={friendsState}
          onStateChange={setFriendsState}
          onAvatarClick={(id, type) => {
            // Clicking Me navigates to home feed with "Mine" view
            if (type === 'me') {
              setFolderPath([]);
              router.push('/feed?view=mine');
              return;
            }
            // Friends/groups: future implementation (friend feed view)
          }}
        />
      </div>

      </div>
      </div>

      {/* Add Card Sheet */}
      <AddCardSheet open={openAdd} onClose={() => setOpenAdd(false)} />

      {/* Add Folder Sheet — mobile only */}
      {isMobile && (
        <AddFolderSheet open={openFolder} onClose={() => setOpenFolder(false)} />
      )}

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

      {/* Multi-select context menu + undo toast (P7-T03) */}
      <SelectionOverlay
        isMobile={isMobile}
        activeFolderId={folderPath.length > 0 ? folderPath[folderPath.length - 1] : null}
        onToast={(msg, kind) => setToast({ kind: kind ?? 'ok', message: msg })}
      />

      {/* DnD result toast */}
      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 88,
            left: '50%',
            transform: 'translateX(-50%)',
            background: toast.kind === 'ok' ? 'var(--surface-4)' : 'var(--red, #dc2626)',
            color: toast.kind === 'ok' ? 'var(--text-1)' : '#fff',
            padding: '8px 14px',
            borderRadius: 10,
            fontSize: 12,
            fontWeight: 600,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            zIndex: 200,
            pointerEvents: 'none',
          }}
        >
          {toast.message}
        </div>
      )}
    </div>
    </DndProvider>
  );
}

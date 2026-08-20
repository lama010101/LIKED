'use client';

import { useEffect, useMemo, useState, Suspense, useCallback } from 'react';
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
import { useFilterStore, getContextKey } from '@/lib/store/filterStore';
import { useFeedURLSync } from '@/lib/hooks/useFeedURLSync';
import FeedTabs, { TabId } from '@/components/bars/FeedTabs';
import MineSubTabs, { MineSubTab } from '@/components/bars/MineSubTabs';
import SortViewRow from '@/components/bars/SortViewRow';
import TagsStrip from '@/components/bars/TagsStrip';
import ContextStrip, { ContextPill } from '@/components/bars/ContextStrip';
import FabSpeedDial from '@/components/bars/FabSpeedDial';
import FolderPathBar from '@/components/bars/FolderPathBar';
import DesktopToolbar from '@/components/bars/DesktopToolbar';
import { getSessionUser, getFriendBarAction, getGroupBarAction } from '@/app/lib/actions/session';
import { getUserFoldersAction } from '@/app/lib/actions/getFolders';
import { getTagsAction } from '@/app/lib/actions/getTags';
import type { SessionUser } from '@/app/lib/actions/session';
import type { FriendBarEntry, GroupBarEntry } from '@/lib/db/friends';

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');

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
  memberCount?: number;
  is_pending?: boolean;
  user_id?: string;
}

function friendBarToBottomBarItems(
  sessionUser: SessionUser,
  friends: FriendBarEntry[],
  groups: GroupBarEntry[]
): BottomBarItem[] {
  const initial = (name: string | null) =>
    (name ?? '?').charAt(0).toUpperCase();

  const meItem: BottomBarItem = {
    id: sessionUser.id,
    type: 'me',
    displayName: sessionUser.display_name ?? 'Me',
    initial: initial(sessionUser.display_name),
    bg: 'linear-gradient(135deg,#f5a623,#ff6b6b)',
  };

  const friendItems: BottomBarItem[] = friends.map((f) => ({
    id: f.user_id ?? f.to_email ?? Math.random().toString(),
    type: 'friend',
    displayName: f.display_name ?? f.to_email ?? 'Pending',
    initial: initial(f.display_name ?? f.to_email),
    bg: 'linear-gradient(135deg,#4a9fd5,#1c6fa0)',
    hasNew: false,
    is_pending: f.is_pending,
    user_id: f.user_id ?? undefined,
  }));

  const groupItems: BottomBarItem[] = groups.map((g) => ({
    id: g.id,
    type: 'group',
    displayName: g.name,
    initial: initial(g.name),
    bg: 'linear-gradient(135deg,#7b3ad5,#4a1ca0)',
    memberCount: g.member_count,
  }));

  return [meItem, ...friendItems, ...groupItems];
}

function AppShell({ children }: { children: React.ReactNode }) {
  // P9-T03: Filter state from store (URL is source of truth via useFeedURLSync)
  useFeedURLSync();
  const filterView = useFilterStore((s) => s.view);
  const setFilterView = useFilterStore((s) => s.setView);
  const setMineSubTabStore = useFilterStore((s) => s.setMineSubTab);
  const mineSubTabStore = useFilterStore((s) => s.mineSubTab);
  const tagIds = useFilterStore((s) => s.tagIds);
  const filterFriendIds = useFilterStore((s) => s.filterFriendIds);
  const filterFolderIds = useFilterStore((s) => s.filterFolderIds);
  const activeFolderId = useFilterStore((s) => s.folderId);
  const searchQuery = useFilterStore((s) => s.searchQuery);
  const toggleTagFilter = useFilterStore((s) => s.toggleTagFilter);
  const toggleFriendFilter = useFilterStore((s) => s.toggleFriendFilter);
  const toggleFolderFilter = useFilterStore((s) => s.toggleFolderFilter);
  const setSearch = useFilterStore((s) => s.setSearch);
  const clearFilters = useFilterStore((s) => s.clearFilters);
  const clearAll = useFilterStore((s) => s.clearAll);

  // Tag label/color lookup for Context Strip — populated from real tag data
  const [tagLabelMap, setTagLabelMap] = useState<Record<string, string>>({});
  const [tagColorMap, setTagColorMap] = useState<Record<string, string>>({});

  const [sessionUser, setSessionUser] = useState<SessionUser | null>(null);
  const [bottomBarItems, setBottomBarItems] = useState<BottomBarItem[]>([]);
  const [layoutFolders, setLayoutFolders] = useState<Array<{ id: string; name: string; color_hex: string; parent_folder_id: string | null }>>([]);
  const folderStack = useFilterStore((s) => s.folderStack);
  const profileDisplayName = sessionUser?.display_name ?? '';
  const setProfileDisplayName = (name: string) =>
    setSessionUser((prev) => prev ? { ...prev, display_name: name } : prev);

  // Load session user, friend bar, and group bar on mount
  useEffect(() => {
    let cancelled = false;
    getSessionUser().then((user) => {
      if (cancelled || !user) return;
      setSessionUser(user);
      Promise.all([
        getFriendBarAction(),
        getGroupBarAction(),
        getTagsAction('en'),
      ]).then(([friends, groups, tags]) => {
        if (cancelled) return;
        setBottomBarItems(friendBarToBottomBarItems(user, friends, groups));
        if (tags) {
          const labels: Record<string, string> = {};
          const colors: Record<string, string> = {};
          tags.forEach((t) => {
            labels[t.id] = t.label;
            colors[t.id] = t.color_hex;
          });
          setTagLabelMap(labels);
          setTagColorMap(colors);
        }
      });
    });
    return () => { cancelled = true; };
  }, []);

  const refreshFolders = useCallback(() => {
    getUserFoldersAction()
      .then((f) => setLayoutFolders(f))
      .catch((err) => console.error('[layout] getUserFoldersAction failed:', err));
  }, []);

  const refreshFriends = useCallback(() => {
    if (!sessionUser) return;
    Promise.all([
      getFriendBarAction(),
      getGroupBarAction(),
    ]).then(([friends, groups]) => {
      setBottomBarItems(friendBarToBottomBarItems(sessionUser, friends, groups));
    }).catch((err) => console.error('[layout] refreshFriends failed:', err));
  }, [sessionUser]);

  // Load folders on mount; refreshFolders can also be called post-creation
  useEffect(() => {
    refreshFolders();
  }, [refreshFolders]);

  // Rebuild full ancestry chain from layoutFolders on deep-link / page load
  useEffect(() => {
    if (!activeFolderId || layoutFolders.length === 0) return;
    // Only rebuild if stack is empty or out of sync with activeFolderId
    const currentStack = useFilterStore.getState().folderStack;
    const topOfStack = currentStack[currentStack.length - 1];
    if (topOfStack?.id === activeFolderId) return; // already correct

    // Rebuild full ancestry chain from layoutFolders
    const chain: Array<{ id: string; name: string; color_hex: string }> = [];
    let currentId: string | null = activeFolderId;
    while (currentId) {
      const folder = layoutFolders.find(f => f.id === currentId);
      if (!folder) break;
      chain.unshift({ id: folder.id, name: folder.name, color_hex: folder.color_hex });
      currentId = folder.parent_folder_id;
    }
    if (chain.length > 0) {
      useFilterStore.getState().setFolderStack(chain);
    }
  }, [activeFolderId, layoutFolders]);

  // Build active-context pills for Context Strip (PRD §11.3g)
  const contextPills = useMemo<ContextPill[]>(() => {
    const pills: ContextPill[] = [];
    tagIds.forEach((id) => {
      pills.push({ id, type: 'tag', label: tagLabelMap[id] ?? id, color: tagColorMap[id] });
    });
    filterFriendIds.forEach((id) => {
      const friend = bottomBarItems.find((s) => s.id === id);
      pills.push({ id, type: 'friend', label: friend?.displayName ?? id, avatar: friend?.bg });
    });
    filterFolderIds.forEach((id) => {
      const folder = layoutFolders.find((f) => f.id === id);
      pills.push({ id, type: 'folder', label: folder?.name ?? 'Folder' });
    });
    if (searchQuery) {
      pills.push({ id: 'search', type: 'search', label: `"${searchQuery}"` });
    }
    return pills;
  }, [tagIds, filterFriendIds, filterFolderIds, searchQuery, bottomBarItems, tagLabelMap, tagColorMap, layoutFolders]);

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
  const [, setOpenFilter] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [openFolder, setOpenFolder] = useState(false);
  const [speedDialOpen, setSpeedDialOpen] = useState(false);
  const [openProfile, setOpenProfile] = useState(false);
  const [notificationCount] = useState(2);
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; message: string } | null>(null);
  const [trashCount, setTrashCount] = useState<number>(0);
  const isMobile = useIsMobile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydrateFromStorage = useFilterStore((s) => s.hydrateFromStorage);
  const setCurrentContextKey = useFilterStore((s) => s.setCurrentContextKey);

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

  // Hydrate viewMode and zoom from per-context localStorage on mount and context change
  useEffect(() => {
    const sp = new URLSearchParams(searchParams.toString());
    const key = getContextKey(sp);
    setCurrentContextKey(key);
    hydrateFromStorage(key);
  }, [searchParams, hydrateFromStorage, setCurrentContextKey]);

  const handleThemeChange = (t: 'dark' | 'light') => {
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t);
  };

  const isInFolder = folderPath.length > 0;

  const breadcrumbPath = folderStack.map(f => ({
    id: f.id,
    name: f.name,
    colors: [f.color_hex],
  }));

  return (
    <DndProvider>
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* DESKTOP SIDEBAR — hidden below lg */}
      <div className="hidden lg:flex" style={{ flexShrink: 0 }}>
        <DesktopSidebar items={bottomBarItems} displayName={profileDisplayName} />
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
          userId={sessionUser?.id ?? ''}
          avatarKey={sessionUser?.avatar_key ?? null}
          displayName={profileDisplayName}
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
        <TagsStrip 
          visible={tagsStripOpen} 
          userId={sessionUser?.id ?? ''} 
          languageCode={sessionUser?.language_code || 'en'} 
        />
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
        zoom={zoom}
        onZoomChange={setZoom}
        sortLabel="Newest"
        onSortClick={() => setOpenFilter(true)}
        notificationCount={notificationCount}
        onNotificationClick={() => {}}
        isInFolder={isInFolder}
        folderName={isInFolder ? 'Current Folder' : undefined}
        onBackClick={() => setFolderPath((p) => p.slice(0, -1))}
        onProfileClick={() => setOpenProfile(true)}
        userDisplayName={profileDisplayName}
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

      {/* Folder Path Bar — above content */}
      <div>
        {friendsState !== 'expanded' && (
          <FolderPathBar
            path={breadcrumbPath}
            totalCount={layoutFolders.length}
            onNavigate={(id) => {
              if (id === 'root') {
                useFilterStore.getState().clearContext();
              } else {
                // Navigate to a specific crumb — truncate stack to that point
                const idx = folderStack.findIndex(f => f.id === id);
                if (idx >= 0) {
                  useFilterStore.getState().setFolderStack(folderStack.slice(0, idx + 1));
                  useFilterStore.getState().setContext({ folderId: id });
                }
              }
            }}
            onBack={() => {
              if (folderStack.length <= 1) {
                useFilterStore.getState().clearContext();
              } else {
                const next = folderStack.slice(0, -1);
                useFilterStore.getState().setFolderStack(next);
                useFilterStore.getState().setContext({ folderId: next[next.length - 1].id });
              }
            }}
            visible={folderPathBarVisible}
            onToggleVisibility={() => setFolderPathBarVisible(v => !v)}
          />
        )}
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
          {/* BottomBar */}
          <BottomBar
          items={bottomBarItems}
          state={friendsState}
          onStateChange={setFriendsState}
          currentUserId={sessionUser?.id}
          onRefresh={refreshFriends}
          onAvatarClick={(id, type) => {
            // Clicking Me clears all filters and returns to personal feed
            if (type === 'me') {
              clearAll();
              setFolderPath([]);
              router.push('/feed?view=all');
              return;
            }
            // Friends: toggle friend filter (AND logic per PRD §16)
            if (type === 'friend') {
              toggleFriendFilter(id);
              return;
            }
            // Groups: future implementation (group feed view)
          }}
        />
      </div>

      </div>
      </div>

      {/* Add Card Sheet */}
      <AddCardSheet 
        open={openAdd} 
        onClose={() => setOpenAdd(false)} 
        userId={sessionUser?.id ?? ''} 
        languageCode={sessionUser?.language_code || 'en'} 
      />

      {/* Add Folder Sheet — mobile only */}
      {isMobile && (
        <AddFolderSheet
          open={openFolder}
          onClose={() => setOpenFolder(false)}
          parentFolderId={activeFolderId ?? null}
          onFolderCreated={refreshFolders}
        />
      )}

      {/* Profile Modal */}
      <ProfileModal
        open={openProfile}
        onClose={() => setOpenProfile(false)}
        userId={sessionUser?.id ?? ''}
        displayName={profileDisplayName}
        avatarKey={sessionUser?.avatar_key ?? null}
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

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={null}>
      <AppShell>{children}</AppShell>
    </Suspense>
  );
}

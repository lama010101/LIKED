'use client';

import { useEffect, useMemo, useState, Suspense, useCallback } from 'react';
import AddCardSheet from '@/components/sheets/AddCardSheet';
import AddFolderSheet from '@/components/sheets/AddFolderSheet';
import ProfileModal from '@/components/modals/ProfileModal';
import Sidebar from '@/components/sidebar/Sidebar';
import AppHeader from '@/components/bars/AppHeader';
import StoriesBar from '@/components/bars/StoriesBar';
import FoldersStrip from '@/components/bars/FoldersStrip';
import FriendManagerModal from '@/components/modals/FriendManagerModal';
import FriendActionSheet, { type FriendSheetTarget } from '@/components/sheets/FriendActionSheet';
import DndProvider from '@/lib/dnd/DndProvider';
import SelectionOverlay from '@/components/selection/SelectionOverlay';
import { useRouter, useSearchParams } from 'next/navigation';
import { useLocalStorage } from '@/lib/hooks/useLocalStorage';
import { useFilterStore, getContextKey } from '@/lib/store/filterStore';
import { useFeedURLSync } from '@/lib/hooks/useFeedURLSync';
import TagsStrip from '@/components/bars/TagsStrip';
import ContextStrip, { ContextPill } from '@/components/bars/ContextStrip';
import FabSpeedDial from '@/components/bars/FabSpeedDial';
import NotificationPanel from '@/components/modals/NotificationPanel';
import OnboardingRunner from '@/components/onboarding/OnboardingRunner';
import { getSessionUser, getFriendBarAction, getGroupBarAction, type SessionUser } from '@/app/lib/actions/session';
import { getUserFoldersAction } from '@/app/lib/actions/getFolders';
import { getTagsAction } from '@/app/lib/actions/getTags';
import { getUnreadNotificationCountAction } from '@/app/lib/actions/notifications';
import { useRealtime } from '@/lib/hooks/useRealtime';
import { toast as showToast } from '@/lib/store/toastStore';
import { useIsMobile } from './_lib/useIsMobile';
import { friendBarToBottomBarItems, type BottomBarItem } from './_lib/friendBarToBottomBarItems';
import type { SidebarTag } from '@/components/sidebar/Sidebar';

function AppShell({ children }: { children: React.ReactNode }) {
  // P9-T03: Filter state from store (URL is source of truth via useFeedURLSync)
  useFeedURLSync();
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
  const setContext = useFilterStore((s) => s.setContext);

  // Tag label/color lookup for Context Strip — populated from real tag data
  const [tagLabelMap, setTagLabelMap] = useState<Record<string, string>>({});
  const [tagColorMap, setTagColorMap] = useState<Record<string, string>>({});
  const [layoutTags, setLayoutTags] = useState<SidebarTag[]>([]);

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
          setLayoutTags(tags);
        }
      }).catch(() => {
        if (!cancelled) showToast.error('Failed to load sidebar data. Please refresh the page.');
      });
    }).catch(() => {
      // Session fetch failure — user will see unauthenticated state
    });
    return () => { cancelled = true; };
  }, []);

  const refreshFolders = useCallback(() => {
    getUserFoldersAction()
      .then((f) => setLayoutFolders(f))
      .catch(() => showToast.error('Failed to load folders. Please refresh the page.'));
  }, []);

  const refreshFriends = useCallback(() => {
    if (!sessionUser) return;
    Promise.all([
      getFriendBarAction(),
      getGroupBarAction(),
    ]).then(([friends, groups]) => {
      setBottomBarItems(friendBarToBottomBarItems(sessionUser, friends, groups));
    }).catch(() => showToast.error('Failed to load friends list. Please refresh the page.'));
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

  const [theme, setThemeState] = useLocalStorage<'dark' | 'light'>('liked.theme', 'light');
  const [sidebarClosed, setSidebarClosed] = useLocalStorage<boolean>('liked.sidebarClosed', false);
  const [tagsStripOpen, setTagsStripOpen] = useState(false);
  const [openAdd, setOpenAdd] = useState(false);
  const [openFolder, setOpenFolder] = useState(false);
  const [speedDialOpen, setSpeedDialOpen] = useState(false);
  const [openProfile, setOpenProfile] = useState(false);
  const [fmOpen, setFmOpen] = useState(false);
  const [fmTab, setFmTab] = useState<'friends' | 'groups'>('friends');
  const [friendSheet, setFriendSheet] = useState<FriendSheetTarget | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notificationPanelOpen, setNotificationPanelOpen] = useState(false);

  // Fetch initial unread notification count
  useEffect(() => {
    getUnreadNotificationCountAction().then(setNotificationCount).catch(() => {});
  }, []);
  const isMobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Surface YouTube OAuth callback failures (?youtube_error=...) as a toast,
  // then strip the param so it doesn't re-fire.
  useEffect(() => {
    const err = searchParams.get('youtube_error');
    if (!err) return;
    showToast.error(`YouTube connection failed (${err.replaceAll('_', ' ')}).`);
    const next = new URLSearchParams(searchParams.toString());
    next.delete('youtube_error');
    const qs = next.toString();
    router.replace(`${window.location.pathname}${qs ? `?${qs}` : ''}`);
  }, [searchParams, router]);
  const hydrateFromStorage = useFilterStore((s) => s.hydrateFromStorage);
  const setCurrentContextKey = useFilterStore((s) => s.setCurrentContextKey);

  // P10-T01: Realtime subscriptions
  const handleNewShare = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleNewNotification = useCallback(() => {
    setNotificationCount((prev) => prev + 1);
  }, []);

  const handleRatingChange = useCallback((_nodeId: string) => {
    router.refresh();
  }, [router]);

  const handleProfileChange = useCallback((_userId: string) => {
    router.refresh();
  }, [router]);

  const handleNodeTitleChange = useCallback((_nodeId: string) => {
    router.refresh();
  }, [router]);

  useRealtime({
    userId: sessionUser?.id ?? null,
    onNewShare: handleNewShare,
    onNewNotification: handleNewNotification,
    onRatingChange: handleRatingChange,
    onProfileChange: handleProfileChange,
    onNodeTitleChange: handleNodeTitleChange,
  });

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

  // Story rail tap semantics: Me → personal feed; friend → friend-context
  // feed; group → group-context feed (tap again clears). Mirrors the old
  // BottomBar onAvatarClick routing, minus the multi-filter toggle which
  // moved to the proto context model.
  const handleAvatarClick = (id: string, type: 'me' | 'friend' | 'group') => {
    if (type === 'me') {
      clearAll();
      router.push('/feed?view=all');
      return;
    }
    if (type === 'friend') {
      const current = useFilterStore.getState().friendId;
      if (current === id) {
        setContext({ friendId: null });
        router.push('/feed?view=all');
      } else {
        setContext({ friendId: id });
        router.push(`/feed?friend=${id}`);
      }
      return;
    }
    // group
    const currentGroupId = useFilterStore.getState().groupId;
    if (currentGroupId === id) {
      setContext({ groupId: null });
      router.push('/feed?view=all');
    } else {
      setContext({ groupId: id });
      router.push(`/feed?group=${id}`);
    }
  };

  return (
    <DndProvider>
    <div className={`v2-app${sidebarClosed ? ' sidebar-closed' : ''}`}>
      {/* Sidebar — collapsible 260px → 72px rail (hidden ≤700px by CSS) */}
      <Sidebar
        collapsed={sidebarClosed}
        onToggle={() => setSidebarClosed(!sidebarClosed)}
        folders={layoutFolders}
        tags={layoutTags}
      />

      {/* MAIN COLUMN */}
      <div className="main">
        {/* Header — search pill + notifications + avatar (all breakpoints) */}
        <AppHeader
          notificationCount={notificationCount}
          onBell={() => setNotificationPanelOpen(true)}
          onProfile={() => setOpenProfile(true)}
          onTags={() => setTagsStripOpen((v) => !v)}
          avatarKey={sessionUser?.avatar_key ?? null}
          displayName={profileDisplayName || null}
        />

        {/* Stories rail — Me + friends + groups + Manage/New group */}
        <StoriesBar
          items={bottomBarItems}
          onAvatarClick={handleAvatarClick}
          onFriendLongPress={(item) =>
            setFriendSheet({ userId: item.id, displayName: item.displayName })
          }
          onManage={() => {
            setFmTab('friends');
            setFmOpen(true);
          }}
          onNewGroup={() => {
            setFmTab('groups');
            setFmOpen(true);
          }}
        />

        {/* Folder chips — click-to-filter rail (N6; filterFolderIds → p_filter_folder_ids) */}
        <FoldersStrip folders={layoutFolders} />

        {/* Tags Strip — collapsible, toggled from the header Tags icon (<lg) */}
        {tagsStripOpen && (
          <div className="lg:hidden">
            <TagsStrip
              visible={tagsStripOpen}
              userId={sessionUser?.id ?? ''}
              languageCode={sessionUser?.language_code || 'en'}
            />
          </div>
        )}

        {/* Context Strip — active filter pills (mobile only) */}
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

        {/* Scrollable content — folder chrome + feed live inside FeedGrid */}
        <div className="v2-content">
          {/* ONBOARD-001: background import + single-folder CTA (renders on /feed only) */}
          <OnboardingRunner onFolderCreated={refreshFolders} />
          {children}
        </div>

        {/* Bottom area — FAB only (story rail lives at top in V2) */}
        <div className="bottom-area">
          <FabSpeedDial
            open={speedDialOpen}
            onToggle={() => setSpeedDialOpen((v) => !v)}
            onAction={(id) => {
              setSpeedDialOpen(false);
              if (id === 'card') setOpenAdd(true);
              else if (id === 'folder') setOpenFolder(true);
              else showToast.info('Coming soon');
            }}
          />
        </div>
      </div>

      {/* Add Card Sheet */}
      <AddCardSheet
        open={openAdd}
        onClose={() => setOpenAdd(false)}
        userId={sessionUser?.id ?? ''}
        languageCode={sessionUser?.language_code || 'en'}
      />

      {/* Add Folder Sheet */}
      <AddFolderSheet
        open={openFolder}
        onClose={() => setOpenFolder(false)}
        parentFolderId={activeFolderId ?? null}
        onFolderCreated={refreshFolders}
      />

      {/* Friends & Groups manager (proto friend-manager overlay) */}
      <FriendManagerModal
        open={fmOpen}
        onClose={() => setFmOpen(false)}
        initialTab={fmTab}
        onChanged={refreshFriends}
      />

      {/* Friend action sheet (long-press / right-click on a friend ring) */}
      <FriendActionSheet
        friend={friendSheet}
        onClose={() => setFriendSheet(null)}
        onViewFeed={(f) => {
          setContext({ friendId: f.userId });
          router.push(`/feed?friend=${f.userId}`);
        }}
        onChanged={refreshFriends}
      />

      {/* Profile Modal */}
      <ProfileModal
        open={openProfile}
        onClose={() => setOpenProfile(false)}
        userId={sessionUser?.id ?? ''}
        displayName={profileDisplayName}
        avatarKey={sessionUser?.avatar_key ?? null}
        languageCode={sessionUser?.language_code ?? 'en'}
        theme={theme}
        onThemeChange={handleThemeChange}
        onDisplayNameChange={(name) => setProfileDisplayName(name)}
        onLanguageChange={(lang) => setSessionUser((prev) => prev ? { ...prev, language_code: lang } : prev)}
      />

      {/* Notification Panel (P10-T02) */}
      <NotificationPanel
        open={notificationPanelOpen}
        onClose={() => setNotificationPanelOpen(false)}
        onUnreadCountChange={setNotificationCount}
      />

      {/* Multi-select context menu + undo toast (P7-T03) */}
      <SelectionOverlay
        isMobile={isMobile}
        activeFolderId={folderStack.length > 0 ? folderStack[folderStack.length - 1].id : null}
        onToast={(msg, kind) => {
          if (kind === 'err') showToast.error(msg);
          else showToast.success(msg);
        }}
      />

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

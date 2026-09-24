'use client';

/**
 * Sidebar — PROTO V2 desktop sidebar (UIX-PORT-00 / UIX-04).
 * 260px open → 72px icon rail via .closed (parent adds .sidebar-closed
 * to .v2-app so the content folders-section reveals itself).
 *
 * Content: Folders tree (Everything + nested, dnd drop targets,
 * active-path expansion), Tags (→ tag filters), Library links
 * (Activity /social, Trash /trash, YouTube /youtube). In group context
 * the folder list becomes the group member list.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useFilterStore } from '@/lib/store/filterStore';
import { normalizeFilterState, serializeFilterStateToURL } from '@/lib/utils/feedParams';
import DroppableFolderChip from '@/components/dnd/DroppableFolderChip';
import { getGroupMembersAction } from '@/app/lib/actions/groups';
import type { GroupMemberEntry } from '@/lib/db/groups';
import { supabaseBrowser } from '@/lib/supabase/client';

export interface SidebarFolder {
  id: string;
  name: string;
  color_hex: string;
  parent_folder_id: string | null;
}

export interface SidebarTag {
  id: string;
  label: string;
  color_hex: string;
}

const FolderIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

const LockIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ChevronDown = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const SidebarToggleIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <line x1="9" y1="4" x2="9" y2="20" />
  </svg>
);

const ActivityIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </svg>
);

const TrashIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const YouTubeIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.42a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.42a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.37z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor" stroke="none" />
  </svg>
);

const TagDotIcon = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
  </svg>
);

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  folders: SidebarFolder[];
  tags: SidebarTag[];
}

export default function Sidebar({ collapsed, onToggle, folders, tags }: SidebarProps) {
  const folderId = useFilterStore((s) => s.folderId);
  const groupId = useFilterStore((s) => s.groupId);
  const friendId = useFilterStore((s) => s.friendId);
  const folderStack = useFilterStore((s) => s.folderStack);
  const tagIds = useFilterStore((s) => s.tagIds);
  const setContext = useFilterStore((s) => s.setContext);
  const clearContext = useFilterStore((s) => s.clearContext);
  const setFolderStack = useFilterStore((s) => s.setFolderStack);
  const toggleTagFilter = useFilterStore((s) => s.toggleTagFilter);
  const router = useRouter();
  const pathname = usePathname();

  // Push /feed carrying the current store state. Deferred via setTimeout(0)
  // so useFeedURLSync's store-change router.replace on the current route is
  // issued first and cannot discard this push.
  const navToFeed = () => {
    setTimeout(() => {
      const qs = serializeFilterStateToURL(normalizeFilterState(useFilterStore.getState()));
      router.push(`/feed${qs ? `?${qs}` : ''}`);
    }, 0);
  };

  const [foldersOpen, setFoldersOpen] = useState(true);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [members, setMembers] = useState<GroupMemberEntry[]>([]);

  useEffect(() => {
    if (!groupId) {
      queueMicrotask(() => setMembers([]));
      return;
    }
    let cancelled = false;
    getGroupMembersAction(groupId).then((rows) => {
      if (!cancelled) setMembers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const childrenOf = (parentId: string | null) =>
    folders.filter((f) => f.parent_folder_id === parentId);

  const activePathIds = new Set(folderStack.map((f) => f.id));

  const pathTo = (folder: SidebarFolder) => {
    const path: Array<{ id: string; name: string; color_hex: string }> = [];
    let cur: SidebarFolder | undefined = folder;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      path.unshift({ id: cur.id, name: cur.name, color_hex: cur.color_hex });
      cur = folders.find((f) => f.id === cur!.parent_folder_id);
    }
    return path;
  };

  const selectFolder = (folder: SidebarFolder) => {
    if (folderId === folder.id) {
      clearContext();
      return;
    }
    setContext({ folderId: folder.id });
    setFolderStack(pathTo(folder));
    if (pathname !== '/feed') navToFeed();
  };

  const renderFolderRow = (folder: SidebarFolder, depth: number) => {
    const isActive = folderId === folder.id;
    const depthClass = depth === 0 ? '' : depth === 1 ? ' sub-folder' : ' sub-folder-2';
    const kids = childrenOf(folder.id);
    const expanded = isActive || activePathIds.has(folder.id);
    return (
      <div key={folder.id}>
        <DroppableFolderChip folderId={folder.id} folders={folders} style={{ display: 'block' }}>
          <button
            type="button"
            className={`nav-item${depthClass}${isActive ? ' active' : ''}`}
            onClick={() => selectFolder(folder)}
          >
            <span className="folder-icon" style={{ background: folder.color_hex }}>
              {FolderIcon}
            </span>
            <span>{folder.name}</span>
          </button>
        </DroppableFolderChip>
        {expanded && kids.map((k) => renderFolderRow(k, Math.min(depth + 1, 2)))}
      </div>
    );
  };

  const memberAvatar = (m: GroupMemberEntry) =>
    m.avatar_key
      ? { backgroundImage: `url('${supabaseBrowser.storage.from('avatars').getPublicUrl(m.avatar_key).data.publicUrl}')` }
      : undefined;

  return (
    <aside className={`sidebar${collapsed ? ' closed' : ''}`} aria-label="Sidebar">
      <div className="sidebar-header">
        <div className="logo">
          liked<span>.</span>
        </div>
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggle}
          aria-label="Toggle sidebar"
        >
          {SidebarToggleIcon}
        </button>
      </div>

      <div className={`nav-section${foldersOpen ? '' : ' collapsed'}`}>
        <div
          className="nav-label collapsible-header"
          onClick={() => setFoldersOpen((o) => !o)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setFoldersOpen((o) => !o);
          }}
        >
          <span>Folders</span>
          {ChevronDown}
        </div>
        <div className="collapsible-content">
          {groupId ? (
            members.map((m) => (
              <button
                key={m.user_id}
                type="button"
                className={`nav-item${friendId === m.user_id ? ' active' : ''}`}
                onClick={() => setContext({ friendId: m.user_id })}
              >
                <span
                  className="folder-icon"
                  style={{ background: 'var(--text-3)', borderRadius: '50%', overflow: 'hidden' }}
                >
                  <span className="story-img" style={memberAvatar(m)}>
                    {!m.avatar_key && (m.display_name ?? '?').charAt(0).toUpperCase()}
                  </span>
                </span>
                <span>{m.display_name ?? 'Member'}</span>
              </button>
            ))
          ) : (
            <>
              <button
                type="button"
                className={`nav-item${!folderId ? ' active' : ''}`}
                onClick={() => clearContext()}
              >
                <span
                  className="folder-icon"
                  style={{ background: 'var(--text-3)' }}
                >
                  {FolderIcon}
                  <span className="lock-badge">{LockIcon}</span>
                </span>
                <span>Everything</span>
              </button>
              {childrenOf(null).map((f) => renderFolderRow(f, 0))}
            </>
          )}
        </div>
      </div>

      <div className={`nav-section${tagsOpen ? '' : ' collapsed'}`}>
        <div
          className="nav-label collapsible-header"
          onClick={() => setTagsOpen((o) => !o)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setTagsOpen((o) => !o);
          }}
        >
          <span>Tags</span>
          {ChevronDown}
        </div>
        <div className="collapsible-content">
          {tags.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`nav-item${tagIds.includes(t.id) ? ' active' : ''}`}
              onClick={() => {
                toggleTagFilter(t.id);
                if (pathname !== '/feed') navToFeed();
              }}
            >
              <span className="nav-icon" style={{ color: t.color_hex }}>
                {TagDotIcon}
              </span>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="nav-section">
        <div className="nav-label">My Library</div>
        <Link href="/social" className="nav-item">
          <span className="nav-icon">{ActivityIcon}</span>
          <span>Activity</span>
        </Link>
        <Link href="/trash" className="nav-item">
          <span className="nav-icon">{TrashIcon}</span>
          <span>Trash</span>
        </Link>
        <Link href="/youtube" className="nav-item">
          <span className="nav-icon">{YouTubeIcon}</span>
          <span>YouTube</span>
        </Link>
      </div>
    </aside>
  );
}

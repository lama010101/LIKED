'use client';

/**
 * FolderSection — PROTO V2 folder chrome (UIX-PORT-00 / UIX-09).
 * Renders inside .v2-content above the feed:
 *   .section-header  "Folders · N videos" + "+ New folder"
 *   .folders-grid    Everything card + top-level folder cards
 *                    (group context → member cards instead)
 *   .sub-tabs        per-level child folders of the active path
 *   .mobile-drill    breadcrumb + child-folder-grid (≤700px)
 * Folder cards are dnd drop targets (DroppableFolderChip); ⋯ menu =
 * Rename / Share / Delete via CardMenu.
 */

import { useEffect, useState } from 'react';
import { useFilterStore } from '@/lib/store/filterStore';
import type { Folder } from '@/lib/types/app';
import DroppableFolderChip from '@/components/dnd/DroppableFolderChip';
import { CardMenu, RenameIcon, ShareIcon, DeleteIcon } from '@/components/modals/CardMenu';
import { getGroupMembersAction } from '@/app/lib/actions/groups';
import type { GroupMemberEntry } from '@/lib/db/groups';
import { supabaseBrowser } from '@/lib/supabase/client';

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
const PlusIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

interface FolderSectionProps {
  folders: Folder[];
  totalCount: number;
  onNewFolder: () => void;
  /** Called when a folder is entered (card or sub-tab click). */
  onFolderEnter: (folder: Folder) => void;
  /** Breadcrumb/clear navigation (null → root/Everything). */
  onCrumbClick: (index: number | null) => void;
  onFolderDelete: (folderId: string) => void;
  onFolderRename: (folder: Folder) => void;
  onFolderShare: (folder: Folder) => void;
}

function countLabel(n: number | undefined): string {
  if (n == null) return '';
  return n === 1 ? '1 video' : `${n} videos`;
}

export default function FolderSection({
  folders,
  totalCount,
  onNewFolder,
  onFolderEnter,
  onCrumbClick,
  onFolderDelete,
  onFolderRename,
  onFolderShare,
}: FolderSectionProps) {
  const activeFolderId = useFilterStore((s) => s.folderId);
  const groupId = useFilterStore((s) => s.groupId);
  const friendId = useFilterStore((s) => s.friendId);
  const folderStack = useFilterStore((s) => s.folderStack);
  const setContext = useFilterStore((s) => s.setContext);

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

  const topFolders = folders.filter((f) => f.parent_folder_id === null && !f.deleted_at);
  const childrenOf = (id: string) =>
    folders.filter((f) => f.parent_folder_id === id && !f.deleted_at);

  // Sub-tab rows: children of each folder in the active path.
  const subRows = folderStack
    .map((entry) => ({ parentId: entry.id, kids: childrenOf(entry.id) }))
    .filter((r) => r.kids.length > 0);

  const folderMenu = (folder: Folder) => [
    { label: 'Rename', icon: <RenameIcon />, onClick: () => onFolderRename(folder) },
    { label: 'Share folder', icon: <ShareIcon />, onClick: () => onFolderShare(folder) },
    {
      label: 'Delete',
      icon: <DeleteIcon />,
      onClick: async () => {
        const res = await fetch(`/api/folders/${folder.id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (res.ok) onFolderDelete(folder.id);
      },
      variant: 'danger' as const,
    },
  ];

  const folderCard = (folder: Folder, extraClass = '') => (
    <DroppableFolderChip
      key={folder.id}
      folderId={folder.id}
      folders={folders}
      style={{ display: 'block', minWidth: 0 }}
    >
      <div
        role="button"
        tabIndex={0}
        className={`folder-card${activeFolderId === folder.id ? ' active' : ''}${extraClass}`}
        onClick={() => onFolderEnter(folder)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onFolderEnter(folder);
          }
        }}
      >
        <span className="folder-icon" style={{ background: folder.color_hex }}>
          {FolderIcon}
        </span>
        <span className="folder-info">
          <span className="folder-name">{folder.name}</span>
          <span className="folder-count">{countLabel(folder.node_count)}</span>
        </span>
        <CardMenu items={folderMenu(folder)} ariaLabel="Folder menu" />
      </div>
    </DroppableFolderChip>
  );

  const everythingCard = (
    <div
      role="button"
      tabIndex={0}
      className={`folder-card${!activeFolderId ? ' active' : ''}`}
      onClick={() => onCrumbClick(null)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onCrumbClick(null);
        }
      }}
    >
      <span className="folder-icon" style={{ background: 'var(--accent)' }}>
        {FolderIcon}
        <span className="lock-badge">{LockIcon}</span>
      </span>
      <span className="folder-info">
        <span className="folder-name">Everything</span>
        <span className="folder-count">
          {countLabel(totalCount)}
        </span>
      </span>
    </div>
  );

  return (
    <div className="folders-section">
      <div className="section-header">
        <h2>
          Folders{totalCount != null ? ` · ${countLabel(totalCount)}` : ''}
        </h2>
        <button type="button" className="new-folder" onClick={onNewFolder}>
          {PlusIcon}
          New folder
        </button>
      </div>

      <div className="folders-grid">
        {groupId ? (
          members.map((m) => (
            <div
              key={m.user_id}
              role="button"
              tabIndex={0}
              className={`folder-card${friendId === m.user_id ? ' active' : ''}`}
              onClick={() => setContext({ friendId: m.user_id })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setContext({ friendId: m.user_id });
                }
              }}
            >
              <span
                className="folder-icon"
                style={{ background: 'var(--accent)', borderRadius: '50%', overflow: 'hidden' }}
              >
                <span
                  className="story-img"
                  style={
                    m.avatar_key
                      ? {
                          backgroundImage: `url('${supabaseBrowser.storage.from('avatars').getPublicUrl(m.avatar_key).data.publicUrl}')`,
                        }
                      : {
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: 13,
                        }
                  }
                >
                  {!m.avatar_key && (m.display_name ?? '?').charAt(0).toUpperCase()}
                </span>
              </span>
              <span className="folder-info">
                <span className="folder-name">{m.display_name ?? 'Member'}</span>
                <span className="folder-count">Member</span>
              </span>
            </div>
          ))
        ) : (
          <>
            {everythingCard}
            {topFolders.map((f) => folderCard(f))}
          </>
        )}
      </div>

      {/* Per-level child sub-tabs (desktop) */}
      {subRows.map((row, i) => (
        <div
          key={row.parentId}
          className={`sub-tabs${i === 0 ? ' subfolder-tabs' : ' subsub-tabs'} show`}
        >
          {row.kids.map((k) => (
            <button
              key={k.id}
              type="button"
              className={`sub-tab${activeFolderId === k.id ? ' active' : ''}`}
              onClick={() => onFolderEnter(k)}
            >
              <span className="folder-icon" style={{ background: k.color_hex }}>
                {FolderIcon}
              </span>
              <span>{k.name}</span>
            </button>
          ))}
        </div>
      ))}

      {/* Mobile drill-down (≤700px) */}
      <div className="mobile-drill">
        {folderStack.length > 0 && (
          <div className="mobile-breadcrumb">
            <button
              type="button"
              className="breadcrumb-crumb"
              onClick={() => onCrumbClick(null)}
            >
              Home
            </button>
            {folderStack.map((crumb, i) => (
              <span key={crumb.id} style={{ display: 'contents' }}>
                <span className="breadcrumb-sep">›</span>
                <button
                  type="button"
                  className={`breadcrumb-crumb${i === folderStack.length - 1 ? ' current' : ''}`}
                  onClick={
                    i === folderStack.length - 1 ? undefined : () => onCrumbClick(i)
                  }
                >
                  {crumb.name}
                </button>
              </span>
            ))}
          </div>
        )}
        {groupId ? (
          <div className="child-folder-grid">
            {members.map((m) => (
              <div
                key={m.user_id}
                role="button"
                tabIndex={0}
                className="folder-card"
                onClick={() => setContext({ friendId: m.user_id })}
              >
                <span
                  className="folder-icon"
                  style={{ background: 'var(--accent)', borderRadius: '50%' }}
                >
                  {(m.display_name ?? '?').charAt(0).toUpperCase()}
                </span>
                <span className="folder-info">
                  <span className="folder-name">{m.display_name ?? 'Member'}</span>
                  <span className="folder-count">Member</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="child-folder-grid">
            {(activeFolderId ? childrenOf(activeFolderId) : topFolders).map((f) => folderCard(f))}
          </div>
        )}
      </div>
    </div>
  );
}

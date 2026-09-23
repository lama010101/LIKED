'use client';

import { useFilterStore } from '@/lib/store/filterStore';
import { useTagModeStore } from '@/lib/store/tagModeStore';
import { applyTagToFolderAction } from '@/app/lib/actions/applyTagToNode';
import DroppableFolderChip from '@/components/dnd/DroppableFolderChip';

interface FolderChip {
  id: string;
  name: string;
  color_hex: string;
  parent_folder_id: string | null;
}

interface FoldersStripProps {
  folders: FolderChip[];
  visible?: boolean;
}

/**
 * N6 — click-to-filter folder chips (PRD folder-chip rail).
 * Tapping a chip toggles it in filterFolderIds, which flows to
 * get_feed's p_filter_folder_ids (SQL-side filtering — no client logic).
 * Chips remain drag-and-drop targets via DroppableFolderChip.
 */
export default function FoldersStrip({ folders, visible = true }: FoldersStripProps) {
  const filterFolderIds = useFilterStore((s) => s.filterFolderIds);
  const toggleFolderFilter = useFilterStore((s) => s.toggleFolderFilter);
  // §11.3b step 4 — folder tagging while Tag Mode is active
  const tagModeActive = useTagModeStore((s) => s.active);
  const tagModeTag = useTagModeStore((s) => s.tag);
  const tagFlash = useTagModeStore((s) => s.flash);
  const tagFlashTarget = useTagModeStore((s) => s.flashTarget);

  if (!visible || folders.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        padding: '8px var(--space-md)',
        flexShrink: 0,
      }}
    >
      <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--text-3)', letterSpacing: '0.04em' }}>
        FOLDERS
      </div>
      <div
        className="hide-scrollbar"
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          flexWrap: 'nowrap',
          paddingBottom: 2,
        }}
      >
        {folders.map((folder) => {
          const isActive = filterFolderIds.includes(folder.id);
          const flashing = tagFlashTarget === `folder:${folder.id}`;
          const color = folder.color_hex || 'var(--accent)';
          return (
            <DroppableFolderChip key={folder.id} folderId={folder.id} folders={folders}>
              <button
                type="button"
                onClick={() => {
                  if (tagModeActive) {
                    if (tagModeTag) {
                      void applyTagToFolderAction(tagModeTag.id, folder.id);
                      tagFlash(`folder:${folder.id}`);
                    }
                    return;
                  }
                  toggleFolderFilter(folder.id);
                }}
                aria-pressed={isActive}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '4px 10px',
                  borderRadius: 'var(--r-full)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  cursor: 'pointer',
                  border: isActive
                    ? `2px solid ${color}`
                    : '1px solid var(--border-1)',
                  boxShadow: flashing ? '0 0 0 2px var(--accent, #7c5cfc)' : undefined,
                  background: isActive
                    ? `color-mix(in srgb, ${color} 10%, transparent)`
                    : 'var(--surface-1)',
                  color: isActive ? color : 'var(--text-2)',
                  transition: 'all var(--transition-fast)',
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
                  aria-hidden="true"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                {folder.name}
              </button>
            </DroppableFolderChip>
          );
        })}
      </div>
    </div>
  );
}

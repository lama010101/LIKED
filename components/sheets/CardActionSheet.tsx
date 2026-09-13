'use client';

/**
 * CardActionSheet — PROTO V2 mobile bottom sheet (UIX-PORT-00 / UIX-10).
 * Same actions as the desktop CardMenu + "Copy to folder" → tree picker.
 * Opened from the card ⋮ trigger on mobile (<1024px).
 */

import { ShareIcon, MoveFolderIcon, TagIcon, DeleteIcon } from '@/components/modals/CardMenu';

const CopyIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

interface CardActionSheetProps {
  title: string;
  /** Breadcrumb line under the title (e.g. current folder path). */
  breadcrumb?: string | null;
  onClose: () => void;
  onShare?: () => void;
  onMove?: () => void;
  onCopy?: () => void;
  onAddTag?: () => void;
  onDelete: () => void;
}

export default function CardActionSheet({
  title,
  breadcrumb,
  onClose,
  onShare,
  onMove,
  onCopy,
  onAddTag,
  onDelete,
}: CardActionSheetProps) {
  const act = (fn?: () => void) => () => {
    onClose();
    fn?.();
  };

  return (
    <div className="sheet-overlay" onClick={onClose} role="presentation">
      <div
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Card actions"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-title">{title}</div>
        {breadcrumb && <div className="sheet-breadcrumb">{breadcrumb}</div>}

        {onShare && (
          <button type="button" className="sheet-action" onClick={act(onShare)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <ShareIcon /> Share with…
            </span>
          </button>
        )}
        {onMove && (
          <button type="button" className="sheet-action" onClick={act(onMove)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <MoveFolderIcon /> Move to folder
            </span>
          </button>
        )}
        {onCopy && (
          <button type="button" className="sheet-action" onClick={act(onCopy)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              {CopyIcon} Copy to folder
            </span>
          </button>
        )}
        {onAddTag && (
          <button type="button" className="sheet-action" onClick={act(onAddTag)}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <TagIcon /> Add tag
            </span>
          </button>
        )}
        <button type="button" className="sheet-action sheet-danger" onClick={act(onDelete)}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <DeleteIcon /> Delete
          </span>
        </button>
        <button type="button" className="sheet-action sheet-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

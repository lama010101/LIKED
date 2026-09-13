'use client';

/**
 * FolderTreePicker — PROTO V2 full-screen tree picker (UIX-PORT-00 / UIX-10).
 * mode='move' → radio select → dndMoveNodeToFolder (atomic move RPC).
 * mode='copy' → checkbox multi → dndAddNodeToFolder per target.
 * Folder tree is expandable; current source folder is disabled in move mode.
 */

import { useState } from 'react';
import type { Folder } from '@/lib/types/app';
import { dndMoveNodeToFolder, dndAddNodeToFolder } from '@/app/lib/actions/dnd';
import { toast } from '@/lib/store/toastStore';

const FolderGlyph = (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);
const ChevronRight = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const XIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

interface FolderTreePickerProps {
  nodeId: string;
  mode: 'move' | 'copy';
  folders: Folder[];
  /** Folder the node is currently in (move mode only — disabled as target). */
  sourceFolderId?: string | null;
  onClose: () => void;
  /** Called after a successful move/copy (e.g. feed refresh). */
  onDone?: () => void;
}

export default function FolderTreePicker({
  nodeId,
  mode,
  folders,
  sourceFolderId = null,
  onClose,
  onDone,
}: FolderTreePickerProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const childrenOf = (id: string | null) =>
    folders.filter((f) => f.parent_folder_id === id && !f.deleted_at);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (mode === 'move') {
        next.clear();
        next.add(id);
      } else if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    try {
      if (mode === 'move') {
        const [target] = selected;
        const res = await dndMoveNodeToFolder(nodeId, target, sourceFolderId);
        if (!res.ok) {
          toast.error(res.error ?? 'Move failed');
          return;
        }
      } else {
        for (const folderId of selected) {
          const res = await dndAddNodeToFolder(nodeId, folderId);
          if (!res.ok) {
            toast.error(res.error ?? 'Copy failed');
            return;
          }
        }
      }
      onDone?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const renderRows = (parentId: string | null, depth: number): React.ReactNode =>
    childrenOf(parentId).map((f) => {
      const kids = childrenOf(f.id);
      const isExpanded = expanded.has(f.id);
      const isDisabled = mode === 'move' && f.id === sourceFolderId;
      return (
        <div key={f.id}>
          <div
            className="tree-row"
            style={{ paddingLeft: 16 + depth * 18, opacity: isDisabled ? 0.45 : 1 }}
          >
            {kids.length > 0 ? (
              <button
                type="button"
                className={`tree-chevron${isExpanded ? ' open' : ''}`}
                onClick={() => toggleExpand(f.id)}
                aria-label={isExpanded ? 'Collapse' : 'Expand'}
              >
                {ChevronRight}
              </button>
            ) : (
              <span className="tree-chevron" aria-hidden="true" />
            )}
            <span className="tree-row-icon" style={{ background: f.color_hex }}>
              {FolderGlyph}
            </span>
            <span className="tree-row-name">{f.name}</span>
            <input
              type={mode === 'move' ? 'radio' : 'checkbox'}
              name={mode === 'move' ? 'tree-move-target' : undefined}
              className="tree-row-input"
              checked={selected.has(f.id)}
              disabled={isDisabled}
              onChange={() => toggleSelect(f.id)}
              aria-label={`Select ${f.name}`}
            />
          </div>
          {isExpanded && renderRows(f.id, depth + 1)}
        </div>
      );
    });

  return (
    <div className="tree-picker" role="dialog" aria-modal="true" aria-label={mode === 'move' ? 'Move to folder' : 'Copy to folders'}>
      <div className="tree-picker-header">
        <span>{mode === 'move' ? 'Move to folder' : 'Copy to folders'}</span>
        <button type="button" className="tree-picker-close" onClick={onClose} aria-label="Close">
          {XIcon}
        </button>
      </div>
      <div className="tree-picker-body">
        {folders.length === 0 ? (
          <div className="fm-empty">No folders yet</div>
        ) : (
          renderRows(null, 0)
        )}
      </div>
      <div className="tree-picker-footer">
        <button type="button" className="tree-picker-cancel" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="tree-picker-confirm"
          disabled={selected.size === 0 || busy}
          onClick={handleConfirm}
        >
          {busy ? 'Working…' : mode === 'move' ? 'Move' : `Copy${selected.size > 0 ? ` (${selected.size})` : ''}`}
        </button>
      </div>
    </div>
  );
}

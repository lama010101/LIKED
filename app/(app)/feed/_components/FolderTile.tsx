"use client";

/**
 * FolderTile — extracted from FeedGrid.tsx
 * Renders a single folder card in the feed's folder grid.
 */

import { useState, useEffect } from "react";
import Image from "next/image";
import type { Folder } from "@/lib/types/app";
import { toast } from "@/lib/store/toastStore";

export interface FolderTileProps {
  folder: Folder;
  isActive: boolean;
  onClick: (folder: Folder) => void;
  currentUserId: string;
  onFolderDelete?: (folderId: string) => void;
}

export default function FolderTile({
  folder,
  isActive,
  onClick,
  currentUserId,
  onFolderDelete,
}: FolderTileProps) {
  const color = folder.color_hex || '#7c5cbf';
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const hasThumbnails = folder.thumbnails && folder.thumbnails.length > 0;
  const [menuOpen, setMenuOpen] = useState(false);
  const isOwned = folder.owner_id === currentUserId;

  const handleFolderDelete = async () => {
    setMenuOpen(false);
    const res = await fetch(`/api/folders/${folder.id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) {
      onFolderDelete?.(folder.id);
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(body?.error || 'Failed to delete folder. Please try again.');
    }
  };

  // Escape key closes menu
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    if (menuOpen) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [menuOpen]);

  return (
    <div
      onClick={() => {
        onClick(folder);
      }}
      className="folder-tile"
      style={{
        aspectRatio: '1 / 1',
        borderRadius: 10,
        position: 'relative',
        overflow: 'hidden',
        cursor: 'pointer',
        pointerEvents: 'auto',
        background: `linear-gradient(135deg, ${color}cc, ${color}66)`,
        boxShadow: isActive ? `0 0 0 3px #fff, 0 0 0 5px ${color}` : 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        padding: '8px',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      {/* 2x2 thumbnail collage or fallback color collage */}
      {hasThumbnails ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr',
            gap: '1px',
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="w-1/2 h-1/2 overflow-hidden" style={{ position: 'relative' }}>
              {folder.thumbnails[i] ? (
                <Image
                  src={supabaseUrl + '/storage/v1/object/public/thumbnails/' + folder.thumbnails[i]}
                  alt=""
                  fill
                  sizes="50px"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full"
                  style={{ background: color + '55' }}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: '1fr 1fr',
          }}
        >
          {[`${color}dd`, `${color}99`, `${color}bb`, `${color}55`].map((bg, i) => (
            <div key={i} style={{ background: bg }} />
          ))}
        </div>
      )}
      {/* Folder icon overlay */}
      <div style={{
        position: 'absolute', top: 8, left: 8,
        width: 24, height: 24, borderRadius: 6,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      </div>

      {/* Menu button (top-right) - only show if owned */}
      {isOwned && (
        <span
          role="button"
          aria-label="Folder menu"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(true);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: 9999,
            background: 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 4,
            cursor: 'pointer',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
            <circle cx="12" cy="6" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="18" r="2" />
          </svg>
        </span>
      )}

      {/* Menu popover */}
      {menuOpen && (
        <>
          {/* Full-screen overlay */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenuOpen(false)}
          />
          {/* Popover */}
          <div
            className="absolute top-8 right-2 z-50 bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-2 min-w-[180px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100"
              onClick={() => {
                setMenuOpen(false);
                toast.info('Coming soon');
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                <path d="m15 5 4 4" />
              </svg>
              Rename
            </button>
            <button
              className="w-full text-left px-3 py-2.5 rounded-xl text-sm flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-800 text-red-500"
              onClick={handleFolderDelete}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" />
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              Delete
            </button>
          </div>
        </>
      )}
      {/* Name + count overlay at bottom */}
      <div style={{
        position: 'relative', zIndex: 1,
        background: 'linear-gradient(to top, rgba(0,0,0,0.72), transparent)',
        margin: '-8px', padding: '20px 8px 8px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#fff', lineHeight: 1.2, wordBreak: 'break-word' }}>
          {folder.name}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
          {folder.node_count === 1 ? '1 item' : `${folder.node_count} items`}
        </div>
      </div>
    </div>
  );
}

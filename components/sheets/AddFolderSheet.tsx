'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createFolderAction } from '@/app/lib/actions/createFolder';

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    queueMicrotask(() => setIsDesktop(mq.matches));
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isDesktop;
}

interface AddFolderSheetProps {
  open: boolean;
  onClose: () => void;
  parentFolderId?: string | null;
  onFolderCreated?: () => void;
}

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export default function AddFolderSheet({ open, onClose, parentFolderId, onFolderCreated }: AddFolderSheetProps) {
  const isDesktop = useIsDesktop();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const router = useRouter();

  const handleClose = () => {
    setName('');
    setError(null);
    onClose();
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (trimmedName.length > 50) {
      setError('Folder name must be 50 characters or less');
      return;
    }

    setError(null);
    startSaving(async () => {
      const result = await createFolderAction({ name: trimmedName, parentFolderId: parentFolderId ?? null });
      if (result.ok) {
        onFolderCreated?.();
        handleClose();
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  const canSave = name.trim() !== '' && !isSaving;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          zIndex: 50,
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 0.2s',
          display: 'flex',
          alignItems: isDesktop ? 'center' : 'flex-end',
          justifyContent: 'center',
        }}
      />

      {/* Sheet panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add folder"
        style={{
          position: 'fixed',
          zIndex: 51,
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: isDesktop ? '0 8px 32px rgba(0,0,0,0.25)' : '0 -8px 32px rgba(0,0,0,0.25)',
          ...(isDesktop
            ? {
                width: 'min(480px, 90vw)',
                borderRadius: '18px',
                border: '1px solid var(--border-2)',
                transform: open ? 'translateY(0) scale(1)' : 'translateY(20px) scale(0.95)',
                transition: 'transform 0.2s ease-out, opacity 0.2s ease-out',
                opacity: open ? 1 : 0,
              }
            : {
                bottom: open ? 0 : '-100%',
                left: 0,
                right: 0,
                borderRadius: '18px 18px 0 0',
                borderTop: '1px solid var(--border-2)',
                transition: 'bottom 0.25s ease-out',
              }),
        }}
      >
        {/* Drag handle (mobile only) */}
        {!isDesktop && (
          <div
            style={{
              width: 36,
              height: 3,
              borderRadius: 100,
              background: 'var(--text-3)',
              opacity: 0.35,
              margin: '10px auto 0',
            }}
          />
        )}

        {/* Content container */}
        <div style={{ padding: '16px 16px 0' }}>
          {/* Header */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
                New folder
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>
                Create a folder to organize your content
              </p>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close"
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: 36,
                height: 36,
                borderRadius: 12,
                background: 'var(--surface-3)',
                border: '1px solid var(--border-1)',
                color: 'var(--text-2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <XIcon />
            </button>
          </div>

          {/* Folder name input */}
          <div style={{ marginBottom: 16 }}>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Folder name…"
              maxLength={50}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                background: 'var(--surface-3)',
                border: '1px solid var(--border-1)',
                fontSize: 13,
                color: 'var(--text-1)',
                outline: 'none',
              }}
            />
          </div>

          {/* Error message */}
          {error && (
            <div
              role="alert"
              style={{
                marginTop: 4,
                marginBottom: 8,
                padding: '8px 10px',
                borderRadius: 10,
                background: 'rgba(220, 38, 38, 0.12)',
                color: 'var(--red, #dc2626)',
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              {error}
            </div>
          )}

          {/* Create button */}
          <button
            onClick={handleSave}
            disabled={!canSave}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 12,
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
              fontSize: 13,
              fontWeight: 800,
              border: 'none',
              cursor: canSave ? 'pointer' : 'not-allowed',
              marginTop: 8,
              marginBottom: 24,
              opacity: canSave ? 1 : 0.5,
            }}
          >
            {isSaving ? 'Creating…' : 'Create folder'}
          </button>
        </div>

        {/* Safe area padding */}
        <div style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }} />
      </div>
    </>
  );
}

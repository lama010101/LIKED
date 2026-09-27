'use client';

/**
 * FriendActionSheet — PROTO V2 friend bottom sheet (UIX-PORT-00 / UIX-11).
 * Actions: View feed · Remove friend · Block (inline confirm) · Cancel.
 * Replaces the BottomBarAvatar popover — same removeFriendAction /
 * blockUserAction calls.
 */

import { useEffect, useState } from 'react';
import { toast } from '@/lib/store/toastStore';

export interface FriendSheetTarget {
  userId: string;
  displayName: string;
}

interface FriendActionSheetProps {
  friend: FriendSheetTarget | null;
  onClose: () => void;
  onViewFeed?: (f: FriendSheetTarget) => void;
  onChanged?: () => void;
}

export default function FriendActionSheet({
  friend,
  onClose,
  onViewFeed,
  onChanged,
}: FriendActionSheetProps) {
  const [blockConfirm, setBlockConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!friend) setBlockConfirm(false);
  }, [friend]);

  useEffect(() => {
    if (!friend) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [friend, onClose]);

  if (!friend) return null;

  const handleRemove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { removeFriendAction } = await import('@/app/lib/actions/friends');
      const result = await removeFriendAction(friend.userId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onClose();
      onChanged?.();
    } catch {
      toast.error('Failed to remove friend. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleBlockConfirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { blockUserAction } = await import('@/app/lib/actions/friends');
      const result = await blockUserAction(friend.userId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setBlockConfirm(false);
      onClose();
      onChanged?.();
    } catch {
      toast.error('Failed to block user. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="sheet-overlay" onClick={onClose} role="presentation">
        <div
          className="bottom-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={`${friend.displayName} actions`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sheet-title">{friend.displayName}</div>
          {onViewFeed && (
            <button
              type="button"
              className="sheet-action"
              onClick={() => {
                onClose();
                onViewFeed(friend);
              }}
            >
              View feed
            </button>
          )}
          <button
            type="button"
            className="sheet-action"
            disabled={busy}
            onClick={handleRemove}
          >
            Remove friend
          </button>
          <button
            type="button"
            className="sheet-action sheet-danger"
            disabled={busy}
            onClick={() => setBlockConfirm(true)}
          >
            Block {friend.displayName}
          </button>
          <button type="button" className="sheet-action sheet-cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>

      {/* Block confirmation (matches prior popover's confirm) */}
      {blockConfirm && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Block ${friend.displayName}?`}
          className="sheet-overlay"
          style={{ zIndex: 600, alignItems: 'center', padding: 24 }}
          onClick={() => setBlockConfirm(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface-1)',
              borderRadius: 16,
              padding: 24,
              maxWidth: 340,
              width: '100%',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
          >
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text-1)', marginTop: 0 }}>
              Block {friend.displayName}?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20, lineHeight: 1.5 }}>
              They will be removed from your friends and will no longer be able to share content with you.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setBlockConfirm(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  background: 'none',
                  border: '1px solid var(--border-1)',
                  color: 'var(--text-2)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleBlockConfirm}
                disabled={busy}
                autoFocus
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  background: 'var(--accent)',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                {busy ? 'Blocking…' : 'Block'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

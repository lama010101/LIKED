'use client';

import { useEffect, useRef, useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createNodeAction } from '@/app/lib/actions/createNode';
import { directShareAction } from '@/app/lib/actions/sharing';
import { useFilterStore } from '@/lib/store/filterStore';
import { addNodeToFolderAction } from '@/app/lib/actions/addNodeToFolder';
import { getTagsAction } from '@/app/lib/actions/getTags';
import { applyTagToNodeAction } from '@/app/lib/actions/applyTagToNode';
import { getUserFoldersAction } from '@/app/lib/actions/getFolders';
import { supabaseBrowser } from '@/lib/supabase/client';
import { toast } from '@/lib/store/toastStore';
import { useIsDesktop, extractYouTubeId, isYouTubeUrl } from './AddCardSheet/addCardUtils';
import { CARD_TYPES, XIcon } from './AddCardSheet/AddCardTypes';
import { AddCardPreview } from './AddCardSheet/AddCardPreview';
import { AddCardTagSection } from './AddCardSheet/AddCardTagSection';
import { AddCardFolderSection } from './AddCardSheet/AddCardFolderSection';
import { AddCardFriendSection } from './AddCardSheet/AddCardFriendSection';

interface AddCardSheetProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  languageCode: string;
}

export default function AddCardSheet({ open, onClose, userId, languageCode }: AddCardSheetProps) {
  const isDesktop = useIsDesktop();
  const [input, setInput] = useState('');
  const [selectedType, setSelectedType] = useState<'auto' | 'link' | 'image' | 'note'>('auto');
  const [previewType, setPreviewType] = useState<'empty' | 'link' | 'note'>('empty');
  const [previewData, setPreviewData] = useState<{ title?: string; domain?: string; text?: string } | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [urlWarning, setUrlWarning] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [showSuccess, setShowSuccess] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();
  const activeFolderId = useFilterStore((s) => s.folderId);
  const [availableTags, setAvailableTags] = useState<{ id: string; label: string; color: string }[]>([]);
  const [availableFriends, setAvailableFriends] = useState<{ id: string; name: string; avatarKey: string | null }[]>([]);
  const [availableFolders, setAvailableFolders] = useState<{ id: string; name: string; colorHex: string }[]>([]);

  // Reset state when opened. Deferred via microtask to satisfy
  // react-hooks/set-state-in-effect.
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const prev = prevOpenRef.current;
    prevOpenRef.current = open;
    if (open && !prev) {
      queueMicrotask(() => {
        setInput('');
        setSelectedType('auto');
        setPreviewType('empty');
        setPreviewData(null);
        setSelectedTag(null);
        setSelectedFriends(new Set());
        setSelectedFolder(null);
        setSaveError(null);
      });
    }
  }, [open]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Load tags, friends, and folders on mount
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    // Load tags
    getTagsAction(languageCode || 'en')
      .then((tags) => {
        if (!cancelled) setAvailableTags(tags.map(t => ({ id: t.id, label: t.label, color: t.color_hex })));
      })
      .catch(() => toast.error('Failed to load tags.'));

    // Load friends
    Promise.resolve(supabaseBrowser.rpc('get_friend_bar', { p_user_id: userId }))
      .then(({ data, error }) => {
        if (!cancelled && !error && data) {
          const nonPending = data.filter((f) => !f.is_pending && f.user_id);
          setAvailableFriends(nonPending.map((f) => ({
            id: f.user_id as string,
            name: f.display_name ?? 'Unknown',
            avatarKey: f.avatar_key,
          })));
        }
      })
      .catch(() => toast.error('Failed to load friends list.'));

    // Load folders
    getUserFoldersAction()
      .then((folders) => {
        if (!cancelled) setAvailableFolders(folders.map(f => ({ id: f.id, name: f.name, colorHex: f.color_hex })));
      })
      .catch(() => toast.error('Failed to load folders.'));

    return () => { cancelled = true; };
  }, [userId, languageCode]);

  // Update preview based on input and selected type
  const updatePreview = useCallback(() => {
    const text = input.trim();
    if (!text) {
      setPreviewType('empty');
      setPreviewData(null);
      return;
    }

    const isUrl = text.startsWith('http://') || text.startsWith('https://');
    const effectiveType = selectedType === 'auto' ? (isUrl ? 'link' : 'note') : selectedType;

    if (effectiveType === 'link' || effectiveType === 'image') {
      let domain = '';
      try { domain = new URL(text).hostname.replace(/^www\./, ''); } catch { domain = text; }
      setPreviewType('link');
      setPreviewData({ title: effectiveType === 'link' ? 'Link' : 'Image', domain });
    } else {
      setPreviewType('note');
      setPreviewData({ text });
    }
  }, [input, selectedType]);

  const handleInputChange = (value: string) => {
    setInput(value);

    const trimmed = value.trim();
    // YouTube URL validation
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      if (isYouTubeUrl(trimmed) && extractYouTubeId(trimmed) === null) {
        setUrlWarning('Paste a specific YouTube video link, not the homepage.');
      } else {
        setUrlWarning(null);
      }
    } else {
      setUrlWarning(null);
    }

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      updatePreview();
    }, 300);
  };

  const handleNoteInput = () => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    }
  };

  const toggleTag = (tag: string) => {
    setSelectedTag((prev) => (prev === tag ? null : tag));
  };

  const toggleFriend = (id: string) => {
    setSelectedFriends((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleFolder = (id: string) => {
    setSelectedFolder((prev) => (prev === id ? null : id));
  };

  const handleSave = () => {
    const trimmedInput = input.trim();
    if (!trimmedInput) return;

    setSaveError(null);
    startSaving(async () => {
      const isUrl = trimmedInput.startsWith('http://') || trimmedInput.startsWith('https://');
      const effectiveType = selectedType === 'auto' ? (isUrl ? 'link' : 'note') : selectedType;

      const result = await createNodeAction({
        url: (effectiveType === 'link' || effectiveType === 'image') ? trimmedInput : null,
        textContent: (effectiveType === 'link' || effectiveType === 'image') ? null : trimmedInput,
      });
      if (result.ok) {
        // Auto-assign to active folder if one is selected, otherwise use selectedFolder
        const folderIdToAssign = activeFolderId || selectedFolder;
        if (folderIdToAssign) {
          try {
            await addNodeToFolderAction({ nodeId: result.nodeId, folderId: folderIdToAssign });
          } catch {
            // Non-fatal — card is saved, folder assignment failed silently
          }
        }
        // Apply selected tag if any
        if (selectedTag) {
          try {
            await applyTagToNodeAction(selectedTag, result.nodeId);
          } catch {
            // Non-fatal — card is saved, tag assignment failed silently
          }
        }
        // Share with selected friends (non-fatal — card is saved even if share fails)
        if (selectedFriends.size > 0) {
          const friendIds = Array.from(selectedFriends);
          const shareResults = await Promise.allSettled(
            friendIds.map((fid) =>
              directShareAction({ nodeId: result.nodeId, targetUserId: fid, permission: 'view' })
            )
          );
          const failedCount = shareResults.filter((r) => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length;
          if (failedCount > 0) {
            toast.error(`Shared with ${friendIds.length - failedCount} friend(s), ${failedCount} failed`);
          } else {
            toast.success(`Shared with ${friendIds.length} friend(s)`);
          }
        }
        setInput('');
        setSelectedType('auto');
        setSelectedFriends(new Set());
        setSaveError(null);
        setUrlWarning(null);
        onClose();
        router.refresh();
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 2000);
      } else {
        setSaveError(result.error);
      }
    });
  };

  const canSave =
    input.trim() !== '' && !isSaving && !urlWarning;
  const saveLabel = 'Save Card';

  return (
    <>
      {/* Success banner */}
      {showSuccess && (
        <div style={{
          position: 'fixed',
          bottom: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--accent)',
          color: 'var(--accent-ink)',
          padding: '10px 20px',
          borderRadius: 12,
          fontSize: 13,
          fontWeight: 700,
          zIndex: 9999,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}>
          ✓ Saved
        </div>
      )}
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
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
        aria-label="Add card"
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
                Add Card
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>
                Paste a link or jot a thought
              </p>
            </div>
            <button
              onClick={onClose}
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

          {/* Type chip strip */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              padding: '0 4px',
              marginBottom: 12,
              overflowX: 'auto',
              scrollbarWidth: 'none',
            }}
          >
            {CARD_TYPES.map((type) => {
              const isActive = selectedType === type.id;
              return (
                <button
                  key={type.id}
                  onClick={() => setSelectedType(type.id as typeof selectedType)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    borderRadius: 'var(--r-full)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: 600,
                    color: isActive ? 'var(--accent)' : 'var(--text-2)',
                    background: isActive ? 'var(--accent-soft)' : 'var(--surface-3)',
                    border: isActive ? '1.5px solid var(--accent)' : '1.5px solid var(--border-1)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                    transition: 'all var(--transition-fast)',
                  }}
                >
                  {type.icon}
                  <span>{type.label}</span>
                </button>
              );
            })}
          </div>

          {/* Live preview */}
          <AddCardPreview previewType={previewType} previewData={previewData} />

          {/* Big input textarea */}
          <div style={{ marginBottom: 16 }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                handleInputChange(e.target.value);
              }}
              onInput={handleNoteInput}
              placeholder="Paste a URL, drop a thought, or share a note…"
              style={{
                width: '100%',
                minHeight: 80,
                maxHeight: '200px',
                overflowY: 'auto',
                padding: '12px',
                borderRadius: 10,
                background: 'var(--surface-3)',
                border: '1px solid var(--border-1)',
                fontSize: 14,
                color: 'var(--text-1)',
                resize: 'none',
                outline: 'none',
                lineHeight: 1.5,
              }}
            />
          </div>

          {/* Tag Section */}
          <AddCardTagSection
            availableTags={availableTags}
            selectedTag={selectedTag}
            onToggleTag={toggleTag}
          />

          {/* Folder Selection Section */}
          <AddCardFolderSection
            availableFolders={availableFolders}
            selectedFolder={selectedFolder}
            onToggleFolder={toggleFolder}
          />

          {/* Share With Section */}
          <AddCardFriendSection
            availableFriends={availableFriends}
            selectedFriends={selectedFriends}
            onToggleFriend={toggleFriend}
          />

          {/* URL warning */}
          {urlWarning && (
            <div style={{
              fontSize: 12,
              color: 'var(--red, #ef4444)',
              padding: '6px 10px',
              background: 'rgba(239,68,68,0.08)',
              borderRadius: 8,
              marginBottom: 8,
            }}>
              ⚠ {urlWarning}
            </div>
          )}

          {/* Save error */}
          {saveError && (
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
              {saveError}
            </div>
          )}

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={!canSave || isSaving}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 12,
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
              fontSize: 13,
              fontWeight: 800,
              border: 'none',
              cursor: (canSave && !isSaving) ? 'pointer' : 'not-allowed',
              marginTop: 8,
              marginBottom: 24,
              opacity: (canSave && !isSaving) ? 1 : 0.5,
            }}
          >
            {isSaving ? 'Saving…' : saveLabel}
          </button>
        </div>

        {/* Safe area padding */}
        <div style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }} />

      </div>
    </>
  );
}

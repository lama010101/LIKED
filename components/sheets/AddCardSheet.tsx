'use client';

import { useEffect, useRef, useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createNodeAction } from '@/app/lib/actions/createNode';

interface AddCardSheetProps {
  open: boolean;
  onClose: () => void;
}

const STUB_TAGS = [
  'Music', 'Film', 'Food', 'Travel', 'Tech', 'Finance', 'Health', 'Design', 'Books', 'Games', 'Art'
];

const STUB_FRIENDS = [
  { id: 'al', name: 'Alice', initial: 'A', bg: 'linear-gradient(135deg,#4a9fd5,#1c6fa0)' },
  { id: 'bo', name: 'Bob', initial: 'B', bg: 'linear-gradient(135deg,#d54a9f,#a01c6f)' },
  { id: 'ch', name: 'Chiara', initial: 'C', bg: 'linear-gradient(135deg,#4ad58a,#1ca06f)' },
  { id: 'di', name: 'Diego', initial: 'D', bg: 'linear-gradient(135deg,#d5a44a,#a07a1c)' },
  { id: 'el', name: 'Elena', initial: 'E', bg: 'linear-gradient(135deg,#7b3ad5,#4a1ca0)' },
  { id: 'fa', name: 'Fabio', initial: 'F', bg: 'linear-gradient(135deg,#d53a3a,#a01c1c)' },
  { id: 'gi', name: 'Giulia', initial: 'G', bg: 'linear-gradient(135deg,#3ad5c5,#1c9fa0)' },
  { id: 'hu', name: 'Hugo', initial: 'H', bg: 'linear-gradient(135deg,#a0d53a,#6fa01c)' },
  { id: 'ir', name: 'Iris', initial: 'I', bg: 'linear-gradient(135deg,#d5953a,#a06a1c)' },
  { id: 'je', name: 'Jean', initial: 'J', bg: 'linear-gradient(135deg,#3a50d5,#1c30a0)' },
];

const XIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function AddCardSheet({ open, onClose }: AddCardSheetProps) {
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<{ title: string; domain: string } | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedFriends, setSelectedFriends] = useState<Set<string>>(new Set());
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const router = useRouter();

  // Reset state when opened. Deferred via microtask to satisfy
  // react-hooks/set-state-in-effect.
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const prev = prevOpenRef.current;
    prevOpenRef.current = open;
    if (open && !prev) {
      queueMicrotask(() => {
        setUrl('');
        setNote('');
        setPreview(null);
        setPreviewLoading(false);
        setSelectedTag(null);
        setSelectedFriends(new Set());
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

  // Stub preview fetch with debounce
  const fetchPreview = useCallback(() => {
    setPreviewLoading(true);
    setTimeout(() => {
      setPreview(null);
      setPreviewLoading(false);
    }, 600);
  }, []);

  const handleUrlChange = (value: string) => {
    setUrl(value);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (value.startsWith('http://') || value.startsWith('https://')) {
      debounceRef.current = setTimeout(() => {
        fetchPreview();
      }, 600);
    }
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

  const handleSave = () => {
    const trimmedUrl = url.trim();
    const trimmedNote = note.trim();
    if (!trimmedUrl && !trimmedNote) return;

    setSaveError(null);
    startSaving(async () => {
      const result = await createNodeAction({
        url: trimmedUrl || null,
        textContent: trimmedUrl ? null : trimmedNote,
      });
      if (result.ok) {
        // TODO P8-future: apply selectedTag + selectedFriends share ops here
        onClose();
        router.refresh();
      } else {
        setSaveError(result.error);
      }
    });
  };

  const canSave =
    (url.trim() !== '' || note.trim() !== '') && !isSaving;
  const saveLabel = isSaving
    ? 'Saving…'
    : selectedFriends.size === 0
      ? 'Save to LIKED'
      : `Save and share with ${selectedFriends.size}`;

  return (
    <>
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
        }}
      />

      {/* Sheet panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add card"
        style={{
          position: 'fixed',
          bottom: open ? 0 : '-100%',
          left: 0,
          right: 0,
          zIndex: 51,
          background: 'var(--surface-2)',
          borderRadius: '18px 18px 0 0',
          borderTop: '1px solid var(--border-2)',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 -8px 32px rgba(0,0,0,0.25)',
          transition: 'bottom 0.25s ease-out',
        }}
      >
        {/* Drag handle */}
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

        {/* Content container */}
        <div style={{ padding: '16px 16px 0' }}>
          {/* Header */}
          <div style={{ position: 'relative', marginBottom: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-1)', margin: 0 }}>
                Save a link
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '4px 0 0' }}>
                Drop a URL · add a note · share optionally
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

          {/* URL Input */}
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="Paste or type URL…"
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

          {/* URL Preview */}
          {(previewLoading || preview) && (
            <div
              style={{
                marginTop: 8,
                padding: '8px 10px',
                background: 'var(--surface-3)',
                borderRadius: 10,
                border: '1px solid var(--border-1)',
                display: 'flex',
                gap: 10,
                alignItems: 'center',
              }}
            >
              {previewLoading ? (
                <>
                  {/* Skeleton thumbnail */}
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 8,
                      background: 'var(--surface-4)',
                      animation: 'pulse 1.5s infinite',
                    }}
                  />
                  {/* Skeleton text */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div
                      style={{
                        height: 8,
                        borderRadius: 4,
                        background: 'var(--surface-4)',
                        width: '60%',
                        animation: 'pulse 1.5s infinite',
                      }}
                    />
                    <div
                      style={{
                        height: 6,
                        borderRadius: 4,
                        background: 'var(--surface-4)',
                        width: '40%',
                        animation: 'pulse 1.5s infinite 0.2s',
                      }}
                    />
                  </div>
                </>
              ) : preview ? (
                <>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 8,
                      background: 'var(--surface-4)',
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-1)' }}>
                      {preview.title}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-3)' }}>
                      {preview.domain}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          )}

          {/* Note Textarea */}
          <div style={{ marginBottom: 16 }}>
            <textarea
              ref={textareaRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onInput={handleNoteInput}
              placeholder="Add a note (optional)"
              style={{
                width: '100%',
                minHeight: 48,
                maxHeight: '40vh',
                overflowY: 'auto',
                padding: '10px 12px',
                borderRadius: 10,
                background: 'var(--surface-3)',
                border: '1px solid var(--border-1)',
                fontSize: 13,
                color: 'var(--text-1)',
                resize: 'none',
                outline: 'none',
              }}
            />
          </div>

          {/* Tag Section */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-3)',
                marginBottom: 8,
              }}
            >
              TAG
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {STUB_TAGS.map((tag) => {
                const isActive = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 100,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: 'pointer',
                      background: isActive ? 'transparent' : 'var(--surface-3)',
                      border: isActive ? '1px solid var(--accent)' : '1px solid var(--border-1)',
                      color: isActive ? 'var(--accent)' : 'var(--text-2)',
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Share With Section */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--text-3)',
                marginBottom: 8,
              }}
            >
              SHARE WITH (OPTIONAL)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
              {STUB_FRIENDS.map((friend) => {
                const isSelected = selectedFriends.has(friend.id);
                return (
                  <button
                    key={friend.id}
                    onClick={() => toggleFriend(friend.id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 3,
                      cursor: 'pointer',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: '50%',
                        background: friend.bg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 13,
                        fontWeight: 700,
                        color: '#fff',
                        position: 'relative',
                        border: isSelected ? '2px solid var(--accent)' : 'none',
                      }}
                    >
                      {friend.initial}
                      {isSelected && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: -1,
                            right: -1,
                            width: 14,
                            height: 14,
                            borderRadius: '50%',
                            background: 'var(--accent)',
                            border: '2px solid var(--surface-2)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <CheckIcon />
                        </div>
                      )}
                    </div>
                    <span
                      style={{
                        fontSize: 9,
                        color: 'var(--text-2)',
                        whiteSpace: 'nowrap',
                        maxWidth: 40,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        textAlign: 'center',
                      }}
                    >
                      {friend.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

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
            {saveLabel}
          </button>
        </div>

        {/* Safe area padding */}
        <div style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }} />

        {/* Keyframe animation for skeleton */}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
          }
        `}</style>
      </div>
    </>
  );
}

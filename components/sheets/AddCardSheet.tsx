'use client';

import { useEffect, useRef, useState, useCallback, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createNodeAction } from '@/app/lib/actions/createNode';

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtube.com") {
      const v = u.searchParams.get("v");
      if (v) return v;
      const m = u.pathname.match(/^\/(shorts|embed)\/([A-Za-z0-9_-]+)/);
      if (m) return m[2];
      return null;
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return id || null;
    }
    return null;
  } catch {
    return null;
  }
}

function isYouTubeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname
      .replace(/^www\./, "")
      .replace(/^m\./, "");
    return host === "youtube.com" || host === "youtu.be";
  } catch {
    return false;
  }
}

interface AddCardSheetProps {
  open: boolean;
  onClose: () => void;
}

const STUB_TAGS = [
  'Music', 'Film', 'Food', 'Travel', 'Tech', 'Finance', 'Health', 'Design', 'Books', 'Games', 'Art'
];

const CARD_TYPES = [
  { id: 'auto', label: 'Auto', icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg> },
  { id: 'link', label: 'Link', icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> },
  { id: 'image', label: 'Image', icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg> },
  { id: 'note', label: 'Note', icon: <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> },
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

const STUB_FOLDERS = [
  { id: 'f1', name: 'Work', colors: ['#7c5cfc', '#9a7fff', '#f87171', '#34d399'] },
  { id: 'f2', name: 'Personal', colors: ['#f87171', '#fbbf24', '#34d399', '#60c5f1'] },
  { id: 'f3', name: 'Recipes', colors: ['#f59e0b', '#ef4444', '#f97316', '#eab308'] },
  { id: 'f4', name: 'Travel', colors: ['#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1'] },
  { id: 'f5', name: 'Books', colors: ['#8b5cf6', '#a78bfa', '#c084fc', '#e879f9'] },
  { id: 'f6', name: 'Design', colors: ['#ec4899', '#f472b6', '#fb7185', '#fda4af'] },
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
      try { domain = new URL(text).hostname.replace(/^www\./, ''); } catch (e) { domain = text; }
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
        // TODO P8-future: apply selectedTag + selectedFriends share ops here
        setInput('');
        setSelectedType('auto');
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
                  onClick={() => setSelectedType(type.id as any)}
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
          <div
            style={{
              marginBottom: 12,
              padding: '12px',
              borderRadius: 12,
              background: 'var(--surface-3)',
              border: '1px solid var(--border-1)',
              minHeight: 80,
            }}
          >
            {previewType === 'empty' ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  color: 'var(--text-3)',
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <path d="M3 16l5-5 4 4 3-3 6 6" />
                </svg>
                <span style={{ fontSize: 11, fontWeight: 500 }}>Preview appears here</span>
              </div>
            ) : previewType === 'link' ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px',
                  background: 'var(--surface-2)',
                  borderRadius: 10,
                  border: '1px solid var(--border-1)',
                }}
              >
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 'var(--r-md)',
                    background: 'var(--surface-4)',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="var(--text-3)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 'var(--text-md)',
                      fontWeight: 700,
                      color: 'var(--text-1)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {previewData?.title}
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-3)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {previewData?.domain}
                  </div>
                </div>
              </div>
            ) : previewType === 'note' ? (
              <div
                style={{
                  padding: '16px',
                  borderRadius: 4,
                  background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  transform: 'rotate(-1deg)',
                }}
              >
                <div
                  style={{
                    fontFamily: 'cursive',
                    fontSize: 22,
                    color: '#444',
                    lineHeight: 1.4,
                    wordBreak: 'break-word',
                  }}
                >
                  {previewData?.text}
                </div>
              </div>
            ) : null}
          </div>

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
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 'var(--text-sm)',
                fontWeight: 700,
                color: 'var(--text-2)',
                marginBottom: 8,
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
              <span>Tag</span>
            </div>
            <div
              style={{
                display: 'flex',
                gap: 8,
                overflowX: 'auto',
                scrollbarWidth: 'none',
                paddingBottom: 2,
              }}
            >
              {STUB_TAGS.map((tag) => {
                const isActive = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    style={{
                      padding: '5px 14px',
                      borderRadius: 'var(--r-full)',
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      flexShrink: 0,
                      background: isActive ? 'var(--accent)' : 'var(--surface-3)',
                      border: '2px solid ' + (isActive ? 'var(--accent)' : 'transparent'),
                      color: isActive ? '#fff' : 'var(--text-2)',
                      opacity: isActive ? 1 : 0.7,
                      transition: 'opacity var(--transition-fast)',
                    }}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Folder Selection Section */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 'var(--text-sm)',
                fontWeight: 700,
                color: 'var(--text-2)',
                marginBottom: 8,
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span>Save to folder</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 10,
              }}
            >
              {STUB_FOLDERS.map((folder) => {
                const isSelected = selectedFolder === folder.id;
                return (
                  <button
                    key={folder.id}
                    onClick={() => toggleFolder(folder.id)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      cursor: 'pointer',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 80,
                        height: 68,
                        borderRadius: 'var(--r-md)',
                        overflow: 'hidden',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gridTemplateRows: '1fr 1fr',
                        gap: 1,
                        border: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                        transition: 'border-color var(--transition-fast)',
                        position: 'relative',
                      }}
                    >
                      {folder.colors.map((c, i) => (
                        <span key={i} style={{ background: c }} />
                      ))}
                      {isSelected && (
                        <div
                          style={{
                            position: 'absolute',
                            bottom: -5,
                            right: -5,
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: 'var(--accent)',
                            border: '2.5px solid var(--surface-2)',
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
                        fontSize: 'var(--text-sm)',
                        color: isSelected ? 'var(--accent)' : 'var(--text-2)',
                        fontWeight: isSelected ? 700 : 500,
                        textAlign: 'center',
                      }}
                    >
                      {folder.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Share With Section */}
          <div style={{ marginBottom: 12 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 'var(--text-sm)',
                fontWeight: 700,
                color: 'var(--text-2)',
                marginBottom: 8,
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span>Share with</span>
              {selectedFriends.size > 0 && (
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 600,
                    color: 'var(--text-3)',
                    background: 'var(--surface-3)',
                    padding: '2px 8px',
                    borderRadius: 'var(--r-full)',
                  }}
                >
                  {selectedFriends.size}
                </span>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 0,
                overflowX: 'auto',
                scrollbarWidth: 'none',
              }}
            >
              {STUB_FRIENDS.map((friend) => {
                const isSelected = selectedFriends.has(friend.id);
                return (
                  <button
                    key={friend.id}
                    onClick={() => toggleFriend(friend.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 3,
                      cursor: 'pointer',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      flexShrink: 0,
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
                      }}
                    >
                      {friend.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

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

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { updateUsername, uploadAvatar, updateLanguage } from '@/app/lib/actions/profile';
import { signOut } from '@/app/lib/actions/auth';
import { toast } from '@/lib/store/toastStore';

// ── types ─────────────────────────────────────────────────────────────────

export interface ProfileModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  displayName: string;
  avatarKey: string | null;
  languageCode: string;
  theme: 'dark' | 'light';
  onThemeChange: (t: 'dark' | 'light') => void;
  /** Called when display name is successfully updated so parent can refresh */
  onDisplayNameChange?: (newName: string) => void;
  /** Called when avatar is successfully updated so parent can refresh */
  onAvatarChange?: (newKey: string) => void;
  /** Called when language is successfully updated so parent can refresh */
  onLanguageChange?: (newLang: string) => void;
}

// ── helpers ────────────────────────────────────────────────────────────────

function getAvatarUrl(avatarKey: string | null, supabaseUrl: string): string | null {
  if (!avatarKey) return null;
  return `${supabaseUrl}/storage/v1/object/public/${avatarKey}`;
}

function deterministicGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  const hue = ((h >>> 0) % 360);
  return `linear-gradient(135deg, hsl(${hue},70%,55%), hsl(${(hue + 40) % 360},75%,40%))`;
}

// ── sub-components ─────────────────────────────────────────────────────────

const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const CameraIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

const PencilIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

// ── main component ─────────────────────────────────────────────────────────

export default function ProfileModal({
  open,
  onClose,
  userId,
  displayName,
  avatarKey,
  languageCode,
  theme,
  onThemeChange,
  onDisplayNameChange,
  onAvatarChange,
  onLanguageChange,
}: ProfileModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Username editing
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(displayName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [namePending, setNamePending] = useState(false);

  // Avatar upload
  const [avatarPending, setAvatarPending] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [currentAvatarKey, setCurrentAvatarKey] = useState(avatarKey);

  // Sign out
  const [signOutPending, setSignOutPending] = useState(false);

  // Language
  const [selectedLang, setSelectedLang] = useState(languageCode);
  const [langPending, setLangPending] = useState(false);
  const [langError, setLangError] = useState<string | null>(null);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

  // Sync prop changes
  useEffect(() => {
    setNameInput(displayName);
  }, [displayName]);

  useEffect(() => {
    setCurrentAvatarKey(avatarKey);
  }, [avatarKey]);

  useEffect(() => {
    setSelectedLang(languageCode);
  }, [languageCode]);

  // Dismiss on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setEditingName(false);
      setNameError(null);
      setAvatarError(null);
      setPreviewUrl(null);
    }
  }, [open]);

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  }, [onClose]);

  // ── Username save ───────────────────────────────────────────────────────

  const handleSaveName = async () => {
    setNameError(null);
    const trimmed = nameInput.trim();
    if (trimmed === displayName) { setEditingName(false); return; }
    if (trimmed.length < 3 || trimmed.length > 32) {
      setNameError('Username must be 3–32 characters.');
      return;
    }
    setNamePending(true);
    try {
      const result = await updateUsername(trimmed);
      if (!result.ok) {
        setNameError(result.error);
      } else {
        setEditingName(false);
        onDisplayNameChange?.(trimmed);
      }
    } catch {
      setNameError('Something went wrong. Please try again.');
    } finally {
      setNamePending(false);
    }
  };

  // ── Avatar upload ───────────────────────────────────────────────────────

  const handleSignOut = async () => {
    setSignOutPending(true);
    try {
      await signOut();
    } catch (err) {
      console.error('[handleSignOut]', err);
      setSignOutPending(false);
      toast.error('Failed to sign out. Please try again.');
    }
  };

  // ── Language change ─────────────────────────────────────────────────────

  const handleLanguageChange = async (lang: string) => {
    if (lang === selectedLang) return;
    setSelectedLang(lang);
    setLangError(null);
    setLangPending(true);
    try {
      const result = await updateLanguage(lang);
      if (!result.ok) {
        setLangError(result.error);
        setSelectedLang(languageCode);
      } else {
        onLanguageChange?.(lang);
      }
    } catch {
      setLangError('Failed to update language.');
      setSelectedLang(languageCode);
    } finally {
      setLangPending(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarError(null);

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setAvatarError('Only JPG, PNG and WebP images are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError('Image must be under 5 MB.');
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setAvatarPending(true);

    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const result = await uploadAvatar(fd);
      if (!result.ok) {
        setAvatarError(result.error);
        setPreviewUrl(null);
      } else {
        setCurrentAvatarKey(result.avatarKey);
        onAvatarChange?.(result.avatarKey);
      }
    } catch {
      setAvatarError('Upload failed. Please try again.');
      setPreviewUrl(null);
    } finally {
      setAvatarPending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── avatar display ──────────────────────────────────────────────────────

  const resolvedAvatarUrl = previewUrl ?? getAvatarUrl(currentAvatarKey, supabaseUrl);
  const initials = (displayName || 'U').slice(0, 2).toUpperCase();
  const gradient = deterministicGradient(userId || displayName || 'default');

  if (!open) return null;

  // ── render ──────────────────────────────────────────────────────────────

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        onClick={handleOverlayClick}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}
        className="sm:items-center"
      >
        {/* Sheet / Modal panel */}
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Profile"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 420,
            background: 'var(--glass-bg)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
            borderRadius: '20px 20px 0 0',
            padding: '8px 0 32px',
            boxShadow: 'var(--shadow-lg)',
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
          }}
          className="sm:rounded-2xl sm:mb-0"
        >
          {/* Drag handle */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 12px' }}>
            <div style={{
              width: 36, height: 4,
              background: 'var(--border-2)',
              borderRadius: 100,
            }} />
          </div>

          {/* ── Avatar + display name ─────────────────────────────────── */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 10, padding: '4px 24px 20px',
          }}>
            {/* Avatar with camera overlay */}
            <div style={{ position: 'relative' }}>
              <button
                aria-label="Change avatar"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarPending}
                style={{
                  position: 'relative', width: 80, height: 80, borderRadius: '50%',
                  background: resolvedAvatarUrl ? undefined : gradient,
                  border: '2px solid var(--border-2)',
                  cursor: 'pointer', overflow: 'hidden', padding: 0,
                  opacity: avatarPending ? 0.6 : 1,
                  transition: 'opacity 0.15s',
                }}
              >
                {resolvedAvatarUrl ? (
                  <Image
                    src={resolvedAvatarUrl}
                    alt="Your avatar"
                    fill
                    sizes="80px"
                    style={{ objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: '100%', height: '100%',
                    fontSize: 24, fontWeight: 700, color: '#fff',
                  }}>
                    {initials}
                  </span>
                )}
                {/* Camera hover overlay */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(0,0,0,0.45)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 0,
                  transition: 'opacity 0.15s',
                }}
                  className="avatar-overlay"
                >
                  <CameraIcon />
                </div>
              </button>

              {/* Spinner when uploading */}
              {avatarPending && (
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.4)',
                }}>
                  <div style={{
                    width: 20, height: 20, border: '2px solid rgba(255,255,255,0.3)',
                    borderTopColor: '#fff', borderRadius: '50%',
                    animation: 'liked-spin 0.7s linear infinite',
                  }} />
                </div>
              )}
            </div>

            {/* Display name */}
            <span style={{
              fontSize: 16, fontWeight: 700, color: 'var(--text-1)',
              letterSpacing: '-0.01em',
            }}>
              {displayName || 'You'}
            </span>

            {avatarError && (
              <span style={{ fontSize: 11, color: 'var(--red)', textAlign: 'center' }}>
                {avatarError}
              </span>
            )}
          </div>

          <div style={{ height: 1, background: 'var(--border-1)', margin: '0 16px 0' }} />

          {/* ── Theme toggle ─────────────────────────────────────────── */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 24px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {theme === 'dark' ? (
                <MoonIcon />
              ) : (
                <SunIcon />
              )}
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
                {theme === 'dark' ? 'Dark mode' : 'Light mode'}
              </span>
            </div>

            {/* Toggle switch */}
            <button
              role="switch"
              aria-checked={theme === 'dark'}
              aria-label="Toggle theme"
              onClick={() => onThemeChange(theme === 'dark' ? 'light' : 'dark')}
              style={{
                width: 44, height: 26,
                borderRadius: 13,
                background: theme === 'dark' ? 'var(--accent)' : 'var(--surface-4)',
                border: 'none', cursor: 'pointer', padding: 3,
                position: 'relative', transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: '#fff',
                position: 'absolute',
                top: 3,
                left: theme === 'dark' ? 21 : 3,
                transition: 'left 0.2s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              }} />
            </button>
          </div>

          <div style={{ height: 1, background: 'var(--border-1)', margin: '0 16px' }} />

          {/* ── Username change ───────────────────────────────────────── */}
          <div style={{ padding: '16px 24px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: editingName ? 10 : 0,
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>
                Username
              </span>
              {!editingName && (
                <button
                  aria-label="Edit username"
                  onClick={() => { setEditingName(true); setNameInput(displayName); setNameError(null); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 8,
                    background: 'var(--surface-3)', border: '1px solid var(--border-1)',
                    color: 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  <PencilIcon />
                  Edit
                </button>
              )}
            </div>

            {!editingName ? (
              <span style={{ fontSize: 15, color: 'var(--text-1)', fontWeight: 600 }}>
                {displayName || '—'}
              </span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input
                  autoFocus
                  type="text"
                  value={nameInput}
                  onChange={(e) => { setNameInput(e.target.value); setNameError(null); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                  maxLength={32}
                  disabled={namePending}
                  placeholder="3–32 characters"
                  style={{
                    width: '100%', padding: '9px 12px',
                    background: 'var(--surface-3)', border: `1px solid ${nameError ? 'var(--red)' : 'var(--border-2)'}`,
                    borderRadius: 10, color: 'var(--text-1)', fontSize: 14,
                    outline: 'none', boxSizing: 'border-box',
                  }}
                />
                {nameError && (
                  <span style={{ fontSize: 11, color: 'var(--red)' }}>{nameError}</span>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleSaveName}
                    disabled={namePending}
                    style={{
                      flex: 1, padding: '9px 0',
                      background: 'var(--accent)', color: 'var(--accent-ink)',
                      border: 'none', borderRadius: 10,
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      opacity: namePending ? 0.7 : 1,
                    }}
                  >
                    {namePending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    onClick={() => { setEditingName(false); setNameError(null); }}
                    disabled={namePending}
                    style={{
                      padding: '9px 16px',
                      background: 'var(--surface-3)', border: '1px solid var(--border-1)',
                      borderRadius: 10, color: 'var(--text-2)',
                      fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ height: 1, background: 'var(--border-1)', margin: '0 16px' }} />

          {/* ── Language selector ─────────────────────────────────────── */}
          <div style={{ padding: '16px 24px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 10,
            }}>
              <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>
                Language
              </span>
              {langPending && (
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Saving…</span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { code: 'en', label: 'English' },
                { code: 'fr', label: 'Français' },
                { code: 'th', label: 'ภาษาไทย' },
              ].map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => handleLanguageChange(lang.code)}
                  disabled={langPending}
                  style={{
                    flex: 1, padding: '8px 0',
                    background: selectedLang === lang.code ? 'var(--accent)' : 'var(--surface-3)',
                    color: selectedLang === lang.code ? 'var(--accent-ink)' : 'var(--text-2)',
                    border: `1px solid ${selectedLang === lang.code ? 'var(--accent)' : 'var(--border-1)'}`,
                    borderRadius: 10,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    opacity: langPending ? 0.6 : 1,
                    transition: 'all 0.15s',
                  }}
                >
                  {lang.label}
                </button>
              ))}
            </div>
            {langError && (
              <span style={{ fontSize: 11, color: 'var(--red)', display: 'block', marginTop: 6 }}>
                {langError}
              </span>
            )}
          </div>

          <div style={{ height: 1, background: 'var(--border-1)', margin: '0 16px' }} />

          {/* ── Install Chrome Extension ──────────────────────────────── */}
          <div style={{ padding: '16px 24px' }}>
            <a
              href="/extension/install"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '10px 0',
                background: 'transparent',
                color: 'var(--text-1)',
                fontSize: 14,
                fontWeight: 500,
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <circle cx="12" cy="12" r="4" />
                  <line x1="21.17" y1="8" x2="12" y2="8" />
                  <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
                  <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
                </svg>
                Install Chrome Extension
              </span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ color: 'var(--text-3)' }}>
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </a>
          </div>

          <div style={{ height: 1, background: 'var(--border-1)', margin: '0 16px' }} />

          {/* ── Sign out ───────────────────────────────────────────────── */}
          <div style={{ padding: '16px 24px' }}>
            <button
              onClick={handleSignOut}
              disabled={signOutPending}
              style={{
                width: '100%',
                padding: '10px 0',
                background: 'transparent',
                border: '1px solid var(--red)',
                borderRadius: 10,
                color: 'var(--red)',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: signOutPending ? 0.7 : 1,
              }}
            >
              {signOutPending ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Avatar hover + spinner animation */}
      <style>{`
        button:hover .avatar-overlay { opacity: 1 !important; }
        @keyframes liked-spin { to { transform: rotate(360deg); } }
      `}</style>
    </>
  );
}

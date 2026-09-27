'use client';

/**
 * AppHeader — PROTO V2 header (UIX-PORT-00 / UIX-05).
 * Replaces TopBar + DesktopToolbar: search pill (useSearchController),
 * bell + unread badge, avatar → ProfileModal. Tags/Trash icon buttons
 * preserved for the mobile shell only (<1024px via .lg:hidden).
 */

import { useSearchController } from '@/lib/hooks/useSearchController';
import { supabaseBrowser } from '@/lib/supabase/client';

const SearchIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const BellIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const TagIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

const TrashIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

interface AppHeaderProps {
  notificationCount: number;
  onBell: () => void;
  onProfile: () => void;
  onTags?: () => void;
  avatarKey: string | null;
  displayName: string | null;
}

export default function AppHeader({
  notificationCount,
  onBell,
  onProfile,
  onTags,
  avatarKey,
  displayName,
}: AppHeaderProps) {
  const { inputValue, setInputValue } = useSearchController();
  const imgUrl = avatarKey
    ? supabaseBrowser.storage.from('avatars').getPublicUrl(avatarKey).data.publicUrl
    : null;
  const initial = (displayName ?? '?').charAt(0).toUpperCase();

  return (
    <header className="v2-header">
      <div className="header-logo">
        liked<span>.</span>
      </div>
      <div className="search-bar">
        {SearchIcon}
        <input
          type="text"
          placeholder="Search videos, folders, creators..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          aria-label="Search"
        />
      </div>
      <div className="header-right">
        {onTags && (
          <button
            type="button"
            className="icon-btn lg:hidden"
            onClick={onTags}
            aria-label="Tags"
          >
            {TagIcon}
          </button>
        )}
        <a
          className="icon-btn lg:hidden"
          href="/trash"
          aria-label="Trash"
        >
          {TrashIcon}
        </a>
        <button
          type="button"
          className="icon-btn"
          onClick={onBell}
          aria-label="Notifications"
        >
          {BellIcon}
          {notificationCount > 0 && (
            <span className="badge has-count">{notificationCount}</span>
          )}
        </button>
        <button
          type="button"
          className="avatar"
          onClick={onProfile}
          aria-label="Profile"
          title="Profile"
        >
          {imgUrl ? (
            <span
              aria-hidden="true"
              style={{
                width: '100%',
                height: '100%',
                backgroundImage: `url('${imgUrl}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />
          ) : (
            initial
          )}
        </button>
      </div>
    </header>
  );
}

/**
 * Friend selection section — extracted from AddCardSheet.tsx
 */

import { supabaseBrowser } from '@/lib/supabase/client';
import { getAvatarColor } from './addCardUtils';
import { CheckIcon } from './AddCardTypes';

interface AddCardFriendSectionProps {
  availableFriends: { id: string; name: string; avatarKey: string | null }[];
  selectedFriends: Set<string>;
  onToggleFriend: (id: string) => void;
}

export function AddCardFriendSection({
  availableFriends,
  selectedFriends,
  onToggleFriend,
}: AddCardFriendSectionProps) {
  return (
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
        {availableFriends.map((friend) => {
          const isSelected = selectedFriends.has(friend.id);
          return (
            <button
              key={friend.id}
              onClick={() => onToggleFriend(friend.id)}
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
                  background: friend.avatarKey
                    ? `url(${supabaseBrowser.storage.from('avatars').getPublicUrl(friend.avatarKey).data.publicUrl}) center/cover`
                    : getAvatarColor(friend.id),
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
                {!friend.avatarKey && friend.name.charAt(0).toUpperCase()}
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
  );
}

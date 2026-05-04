'use client';

import { useRef, useCallback } from 'react';
import BottomBarAvatar, { BottomBarAvatarItem } from './BottomBarAvatar';
import { useDragPauseExpand } from '@/lib/dnd/useDragPauseExpand';

interface BottomBarItem {
  id: string;
  type: 'me' | 'friend' | 'group';
  displayName: string;
  initial: string;
  bg: string;
  hasNew?: boolean;
  memberCount?: number;
}

interface BottomBarProps {
  items: BottomBarItem[];
  onAvatarClick: (id: string, type: 'me' | 'friend' | 'group') => void;
  /** 3-state model per PRD §11.4 */
  state: 'hidden' | 'strip' | 'expanded';
  onStateChange: (state: 'hidden' | 'strip' | 'expanded') => void;
}

export default function BottomBar({ items, onAvatarClick, state, onStateChange }: BottomBarProps) {
  const touchStartY = useRef<number | null>(null);
  const autoExpandRef = useDragPauseExpand<HTMLDivElement>({
    isCollapsed: state === 'hidden',
    onExpand: () => onStateChange('strip'),
    delayMs: 500,
  });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0]?.clientY ?? null;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    const dy = touchStartY.current - (e.changedTouches[0]?.clientY ?? touchStartY.current);
    const absDy = Math.abs(dy);
    touchStartY.current = null;
    if (absDy < 40) return; // too small

    if (dy > 0) {
      // Swipe up
      if (state === 'hidden') onStateChange('strip');
      else if (state === 'strip') onStateChange('expanded');
    } else {
      // Swipe down
      if (state === 'expanded') onStateChange('strip');
      else if (state === 'strip') onStateChange('hidden');
    }
  }, [state, onStateChange]);

  const isHidden = state === 'hidden';
  const isExpanded = state === 'expanded';
  const friendCount = items.filter((i) => i.type === 'friend').length;
  const groupCount = items.filter((i) => i.type === 'group').length;

  return (
    <div className="lg:hidden">
      {/* Expanded panel overlay */}
      {isExpanded && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            top: undefined,
            bottom: 0,
            left: 0,
            right: 0,
            height: '70vh',
            background: 'var(--glass-bg)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
            borderTop: '1px solid var(--glass-border)',
            boxShadow: 'inset 0 1px 0 var(--glass-highlight), var(--glass-shadow)',
            borderTopLeftRadius: 'var(--r-lg)',
            borderTopRightRadius: 'var(--r-lg)',
            zIndex: 'calc(var(--z-bars) + 5)',
            display: 'flex',
            flexDirection: 'column',
            padding: '12px 16px',
            gap: 12,
          }}
        >
          {/* Panel header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-1)' }}>
              Friends & Groups
            </span>
            <button
              type="button"
              onClick={() => onStateChange('strip')}
              aria-label="Close"
              style={{
                width: 32,
                height: 32,
                borderRadius: 'var(--r-md)',
                background: 'var(--surface-3)',
                border: '1px solid var(--border-1)',
                color: 'var(--text-1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" /><path d="m6 6 12 12" />
              </svg>
            </button>
          </div>

          {/* Search stub */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--surface-2)',
              border: '1px solid var(--border-1)',
              borderRadius: 'var(--r-md)',
              padding: '8px 12px',
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-3)', flexShrink: 0 }}>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>Search friends…</span>
          </div>

          {/* Items list */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
              overflowY: 'auto',
              flex: 1,
            }}
            className="hide-scrollbar"
          >
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onAvatarClick(item.id, item.type);
                  onStateChange('strip');
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 10px',
                  borderRadius: 'var(--r-md)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-1)',
                }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: item.type === 'group' ? 10 : '50%',
                    background: item.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#fff',
                    flexShrink: 0,
                    position: 'relative',
                  }}
                >
                  {item.initial}
                  {item.type === 'group' && item.memberCount !== undefined && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: -2,
                        right: -2,
                        minWidth: 14,
                        height: 14,
                        borderRadius: 7,
                        background: 'var(--surface-3)',
                        border: '1px solid var(--border-1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 8,
                        fontWeight: 700,
                        color: 'var(--text-2)',
                        padding: '0 3px',
                      }}
                    >
                      {item.memberCount}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 'var(--text-md)', fontWeight: 600 }}>{item.displayName}</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{item.type === 'me' ? 'You' : item.type === 'friend' ? 'Friend' : 'Group'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bottom dock — flows within .bottom-area, glassmorphic */}
      <div
        ref={autoExpandRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="bottom-dock"
        style={{
          flexShrink: 0,
          transition: 'height 200ms ease',
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          borderTop: '1px solid var(--glass-border)',
          boxShadow: 'inset 0 1px 0 var(--glass-highlight), var(--glass-shadow)',
        }}
      >
        <style>{`.liked-friends-strip::-webkit-scrollbar { display: none; }`}</style>

        {/* Handle */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px 4px',
            color: 'var(--text-3)',
            cursor: 'grab',
            userSelect: 'none',
          }}
          onClick={() => {
            if (isHidden) onStateChange('strip');
            else onStateChange('hidden');
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: isHidden ? 'rotate(0deg)' : 'rotate(180deg)',
                transition: 'transform var(--transition-fast)',
                flexShrink: 0,
              }}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-2)',
              }}
            >
              Friends
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: 'var(--blue)',
                  background: 'rgba(59,130,246,0.08)',
                  padding: '1px 6px',
                  borderRadius: 'var(--r-full)',
                  minWidth: 16,
                  textAlign: 'center',
                  border: '1px solid rgba(59,130,246,0.2)',
                }}
              >
                {friendCount} friends
              </span>
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  color: 'var(--accent)',
                  background: 'var(--accent-soft)',
                  padding: '1px 6px',
                  borderRadius: 'var(--r-full)',
                  minWidth: 16,
                  textAlign: 'center',
                  border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
                }}
              >
                {groupCount} groups
              </span>
            </div>
          </div>

          {/* Fullscreen expand button — opens Friends & Groups sheet */}
          <button
            type="button"
            aria-label="Open friends panel"
            onClick={(e) => {
              e.stopPropagation();
              onStateChange('expanded');
            }}
            style={{
              width: 26,
              height: 26,
              borderRadius: 'var(--r-md)',
              background: 'var(--surface-3)',
              border: '1px solid var(--border-1)',
              color: 'var(--text-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              padding: 0,
              transition: 'background var(--transition-fast), border-color var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-2)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-2)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-3)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-1)';
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
              <path d="M8 3H5a2 2 0 0 0-2 2v3" />
              <path d="M16 3h3a2 2 0 0 1 2 2v3" />
              <path d="M8 21H5a2 2 0 0 1-2-2v-3" />
              <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
            </svg>
          </button>
        </div>

        {/* Friends strip */}
        <div
          className="liked-friends-strip"
          style={{
            display: isHidden ? 'none' : 'flex',
            overflowX: 'auto',
            scrollbarWidth: 'none',
            padding: '0 6px 12px',
            gap: 0,
            maxHeight: 90,
            overflowY: 'hidden',
          }}
        >
          {items.map((item) => (
            <BottomBarAvatar key={item.id} item={item} onClick={onAvatarClick} />
          ))}
        </div>
      </div>
    </div>
  );
}

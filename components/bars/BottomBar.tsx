'use client';

interface BottomBarItem {
  id: string;
  type: 'me' | 'friend' | 'group';
  displayName: string;
  initial: string;
  bg: string;
  hasNew?: boolean;
}

interface BottomBarProps {
  items: BottomBarItem[];
  onAvatarClick: (id: string, type: 'me' | 'friend' | 'group') => void;
  onExpandClick: () => void;
}

export default function BottomBar({ items, onAvatarClick, onExpandClick }: BottomBarProps) {
  return (
    <div className="lg:hidden">
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        flexShrink: 0,
        background: 'var(--surface-2)',
        borderTop: '1px solid var(--border-1)',
      }}
    >
      <style>{`.liked-friends-strip::-webkit-scrollbar { display: none; }`}</style>

      {/* Expand handle */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          padding: '4px 0 6px',
          color: 'var(--text-3)',
          cursor: 'grab',
          userSelect: 'none',
        }}
        onClick={onExpandClick}
      >
        <div
          style={{
            width: 36,
            height: 3,
            background: 'var(--text-3)',
            opacity: 0.35,
            borderRadius: 100,
            marginBottom: 2,
          }}
        />
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
          }}
        >
          FRIENDS
        </span>
      </div>

      {/* Scrollable friends strip */}
      <div
        className="liked-friends-strip"
        style={{
          display: 'flex',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          padding: '0 6px 12px',
          gap: 0,
        }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            onClick={() => onAvatarClick(item.id, item.type)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '0 7px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: item.type === 'group' ? 10 : '50%',
                background: item.bg,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 12,
                fontWeight: 700,
                color: '#fff',
                position: 'relative',
                outline: item.hasNew ? '2px solid var(--accent)' : undefined,
                outlineOffset: item.hasNew ? 2 : undefined,
              }}
            >
              {item.initial}
              {item.type === 'me' && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    border: '1.5px solid var(--surface-2)',
                  }}
                />
              )}
            </div>
            <span
              style={{
                fontSize: 8,
                color: 'var(--text-2)',
                whiteSpace: 'nowrap',
                maxWidth: 44,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                textAlign: 'center',
              }}
            >
              {item.displayName}
            </span>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}

'use client';

interface FolderPathBarProps {
  path: Array<{ id: string; name: string; count?: number }>;
  totalCount?: number;
  onNavigate: (folderId: string) => void;
  onBack: () => void;
  visible: boolean;
  onToggleVisibility: () => void;
}

export default function FolderPathBar({
  path,
  totalCount = 0,
  onNavigate,
  onBack,
  visible,
  onToggleVisibility,
}: FolderPathBarProps) {
  return (
    <div style={{ flexShrink: 0 }}>
      {/* Path handle (click to toggle visibility) */}
      <button
        type="button"
        onClick={onToggleVisibility}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '8px 14px 4px',
          background: 'transparent',
          border: 'none',
          borderBottom: visible ? '1px solid var(--border-1)' : 'none',
          cursor: 'pointer',
          color: 'var(--text-3)',
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
              transform: visible ? 'rotate(180deg)' : 'rotate(0deg)',
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
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
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
            Folders
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
            }}
          >
            {totalCount}
          </span>
        </div>
      </button>

      {/* Path strip */}
      {visible && (
        <div
          className="hide-scrollbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px',
            overflowX: 'auto',
            scrollbarWidth: 'none',
          }}
        >
          {/* Back button */}
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to parent"
            style={{
              width: 28,
              height: 28,
              borderRadius: 'var(--r-sm)',
              background: 'var(--surface-3)',
              border: '1px solid var(--border-1)',
              color: 'var(--text-2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              padding: 0,
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>

          {/* Feed root */}
          <button
            type="button"
            onClick={() => onNavigate('root')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 'var(--r-md)',
              background: 'var(--surface-3)',
              border: '1px solid var(--border-1)',
              color: 'var(--text-2)',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              cursor: 'pointer',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            Feed
          </button>

          <span style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>›</span>

          {/* Path crumbs */}
          {path.map((folder, index) => {
            const isLast = index === path.length - 1;
            return (
              <div key={folder.id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <button
                  type="button"
                  onClick={() => onNavigate(folder.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 'var(--r-md)',
                    background: isLast ? 'var(--accent-soft)' : 'var(--surface-3)',
                    border: `1px solid ${isLast ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--border-1)'}`,
                    color: isLast ? 'var(--accent)' : 'var(--text-2)',
                    fontSize: 'var(--text-sm)',
                    fontWeight: isLast ? 800 : 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {/* Folder icon */}
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 3,
                      background: 'linear-gradient(135deg, var(--accent), var(--accent-light, var(--accent)))',
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                  <span>{folder.name}</span>
                  {folder.count !== undefined && (
                    <span
                      style={{
                        fontSize: 'var(--text-xs)',
                        fontWeight: 600,
                        color: 'var(--text-3)',
                        background: 'var(--surface-2)',
                        padding: '1px 5px',
                        borderRadius: 'var(--r-full)',
                        border: '1px solid var(--border-1)',
                      }}
                    >
                      {folder.count}
                    </span>
                  )}
                </button>
                {!isLast && (
                  <span style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>›</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

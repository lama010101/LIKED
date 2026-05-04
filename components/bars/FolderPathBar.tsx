'use client';

interface FolderPathBarProps {
  path: Array<{ id: string; name: string; count?: number; colors?: string[] }>;
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
    <div
      style={{
        flexShrink: '0',
        backgroundColor: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        WebkitBackdropFilter: 'var(--glass-blur)',
        boxShadow: 'inset 0 1px 0 var(--glass-highlight), var(--glass-shadow)',
      }}
    >
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

      {/* Path strip — prototype style: Home first, then folder crumbs with icons + counts */}
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
          {/* Home crumb */}
          <button
            type="button"
            onClick={() => onNavigate('root')}
            className="path-crumb"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 'var(--r-md)',
              background: path.length === 0 ? 'var(--accent-soft)' : 'var(--surface-3)',
              border: `1px solid ${path.length === 0 ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : 'var(--border-1)'}`,
              color: path.length === 0 ? 'var(--accent)' : 'var(--text-2)',
              fontSize: 'var(--text-sm)',
              fontWeight: path.length === 0 ? 800 : 600,
              cursor: 'pointer',
              flexShrink: 0,
              whiteSpace: 'nowrap',
            }}
          >
            {/* Home icon */}
            <span
              style={{
                width: 16,
                height: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
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
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              </svg>
            </span>
            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'inherit' }}>Home</span>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  color: 'var(--text-3)',
                  background: 'var(--surface-2)',
                  padding: '1px 5px',
                  borderRadius: 'var(--r-full)',
                  border: '1px solid var(--border-1)',
                  marginTop: 2,
                }}
              >
                {totalCount}
              </span>
            </span>
          </button>

          {/* Separator */}
          {path.length > 0 && (
            <span style={{ color: 'var(--text-3)', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>›</span>
          )}

          {/* Folder crumbs */}
          {path.map((folder, index) => {
            const isLast = index === path.length - 1;
            const folderColors = folder.colors ?? ['var(--accent)', 'var(--accent-light)', 'var(--surface-4)', 'var(--surface-3)'];
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
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {/* Folder color icon — 4-color mini grid like prototype */}
                  <span
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      overflow: 'hidden',
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gridTemplateRows: '1fr 1fr',
                      flexShrink: 0,
                    }}
                  >
                    {folderColors.slice(0, 4).map((c, i) => (
                      <span key={i} style={{ background: c }} />
                    ))}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
                    <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'inherit' }}>{folder.name}</span>
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
                          marginTop: 2,
                        }}
                      >
                        {folder.count}
                      </span>
                    )}
                  </span>
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

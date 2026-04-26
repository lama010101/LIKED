'use client';

export type ViewMode = 'col' | 'mason' | 'list' | 'horiz' | 'free';

const sortOptions = [
  { id: 'newest', label: 'Newest' },
  { id: 'oldest', label: 'Oldest' },
  { id: 'rating', label: 'Rating' },
  { id: 'most-shared', label: 'Most Shared' },
  { id: 'custom', label: 'Custom' },
];

const viewModes: { id: ViewMode; icon: React.FC }[] = [
  {
    id: 'col',
    icon: () => (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="7" height="7" x="3" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="3" rx="1" />
        <rect width="7" height="7" x="14" y="14" rx="1" />
        <rect width="7" height="7" x="3" y="14" rx="1" />
      </svg>
    ),
  },
  {
    id: 'mason',
    icon: () => (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="6" height="20" x="4" y="2" rx="1" />
        <rect width="6" height="20" x="14" y="2" rx="1" />
      </svg>
    ),
  },
  {
    id: 'list',
    icon: () => (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    id: 'horiz',
    icon: () => (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="4" x="2" y="4" rx="1" />
        <rect width="16" height="4" x="2" y="10" rx="1" />
        <rect width="20" height="4" x="2" y="16" rx="1" />
      </svg>
    ),
  },
  {
    id: 'free',
    icon: () => (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3H5a2 2 0 0 0-2 2v3" />
        <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
        <path d="M3 16v3a2 2 0 0 0 2 2h3" />
        <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      </svg>
    ),
  },
];

const SortIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m3 16 4 4 4-4" />
    <path d="M7 20V4" />
    <path d="m21 8-4-4-4 4" />
    <path d="M17 4v16" />
  </svg>
);

const ZoomOutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

const ZoomInIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
    <line x1="11" y1="8" x2="11" y2="14" />
    <line x1="8" y1="11" x2="14" y2="11" />
  </svg>
);

interface SortViewRowProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  sortLabel?: string;
  onSortClick?: () => void;
}

export default function SortViewRow({
  view,
  onViewChange,
  zoom,
  onZoomChange,
  sortLabel = 'Newest',
  onSortClick,
}: SortViewRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px var(--space-md)',
        marginBottom: 2,
        flexShrink: 0,
      }}
    >
      {/* Left group: Sort + Zoom */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Sort button */}
        <button
          onClick={onSortClick}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 11px',
            background: 'var(--surface-2)',
            borderRadius: 'var(--r-md)',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-2)',
            border: '1px solid var(--border-1)',
            cursor: 'pointer',
            position: 'relative',
            transition: 'background var(--transition-fast)',
          }}
        >
          <SortIcon />
          <span>{sortLabel}</span>
        </button>

        {/* Zoom stepper — only in col view */}
        {view === 'col' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              padding: 3,
              background: 'var(--surface-2)',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border-1)',
            }}
          >
            <button
              onClick={() => onZoomChange(Math.max(2, zoom - 1))}
              style={{
                width: 26,
                height: 26,
                borderRadius: 'var(--r-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-2)',
                transition: 'background var(--transition-fast)',
              }}
            >
              <ZoomOutIcon />
            </button>
            <span
              suppressHydrationWarning
              style={{
                fontSize: 'var(--text-sm)',
                fontWeight: 700,
                color: 'var(--text-2)',
                minWidth: 36,
                textAlign: 'center',
              }}
            >
              {zoom} col
            </span>
            <button
              onClick={() => onZoomChange(Math.min(6, zoom + 1))}
              style={{
                width: 26,
                height: 26,
                borderRadius: 'var(--r-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                border: 'none',
                background: 'transparent',
                color: 'var(--text-2)',
                transition: 'background var(--transition-fast)',
              }}
            >
              <ZoomInIcon />
            </button>
          </div>
        )}
      </div>

      {/* Right group: View toggle — matches desktop prototype .view-switcher */}
      <div
        style={{
          display: 'flex',
          gap: 2,
          padding: 2,
          background: 'var(--surface-2)',
          borderRadius: 9,
        }}
      >
        {viewModes.map(({ id, icon: Icon }) => {
          const isActive = view === id;
          return (
            <button
              key={id}
              onClick={() => onViewChange(id)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 7,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                border: 'none',
                background: isActive ? 'var(--surface-3)' : 'transparent',
                color: isActive ? 'var(--text-1)' : 'var(--text-3)',
                transition: 'background var(--transition-fast), color var(--transition-fast)',
              }}
            >
              <Icon />
            </button>
          );
        })}
      </div>
    </div>
  );
}

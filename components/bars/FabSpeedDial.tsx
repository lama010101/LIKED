'use client';


const actions = [
  {
    id: 'card',
    label: 'Card',
    color: '#457b9d',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M3 9h18" />
      </svg>
    ),
  },
  {
    id: 'folder',
    label: 'Folder',
    color: '#e76f51',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
      </svg>
    ),
  },
  {
    id: 'template',
    label: 'Template',
    color: '#2a9d8f',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="5" rx="1" />
        <rect x="14" y="11" width="7" height="9" rx="1" />
        <rect x="3" y="13" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  {
    id: 'tag',
    label: 'Tag',
    color: '#7c5cbf',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
        <line x1="7" y1="7" x2="7.01" y2="7" />
      </svg>
    ),
  },
];

interface FabSpeedDialProps {
  open: boolean;
  onToggle: () => void;
  onAction: (id: string) => void;
}

export default function FabSpeedDial({ open, onToggle, onAction }: FabSpeedDialProps) {
  return (
    <>
      {/* Scrim */}
      <div
        onClick={onToggle}
        className={`fab-scrim${open ? ' fab-scrim--open' : ''}`}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 'calc(var(--z-fab) - 1)',
        }}
      />

      {/* Speed-dial actions */}
      <div className={`speed-dial${open ? ' speed-dial--open' : ''}`}>
        {actions.map((action) => (
          <div key={action.id} className="speed-dial__item">
            <span className="speed-dial__label">{action.label}</span>
            <button
              type="button"
              onClick={() => onAction(action.id)}
              aria-label={action.label}
              className="speed-dial__btn"
              style={{ background: action.color }}
            >
              {action.icon}
            </button>
          </div>
        ))}
      </div>

      {/* FAB */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={open ? 'Close' : 'Add'}
        className={`fab${open ? ' fab--open' : ''}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
      </button>
    </>
  );
}

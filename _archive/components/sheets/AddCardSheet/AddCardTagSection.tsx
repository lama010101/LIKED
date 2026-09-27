/**
 * Tag selection section — extracted from AddCardSheet.tsx
 */

interface AddCardTagSectionProps {
  availableTags: { id: string; label: string; color: string }[];
  selectedTag: string | null;
  onToggleTag: (tag: string) => void;
}

export function AddCardTagSection({
  availableTags,
  selectedTag,
  onToggleTag,
}: AddCardTagSectionProps) {
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
        {availableTags.map((tag) => {
          const isActive = selectedTag === tag.id;
          return (
            <button
              key={tag.id}
              onClick={() => onToggleTag(tag.id)}
              style={{
                padding: '5px 14px',
                borderRadius: 'var(--r-full)',
                fontSize: 'var(--text-sm)',
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0,
                background: isActive ? tag.color : 'var(--surface-3)',
                border: '2px solid ' + (isActive ? tag.color : 'transparent'),
                color: isActive ? '#fff' : 'var(--text-2)',
                opacity: isActive ? 1 : 0.7,
                transition: 'opacity var(--transition-fast)',
              }}
            >
              {tag.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

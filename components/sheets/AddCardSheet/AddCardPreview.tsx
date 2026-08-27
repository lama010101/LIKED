/**
 * Live preview section — extracted from AddCardSheet.tsx
 */

interface AddCardPreviewProps {
  previewType: 'empty' | 'link' | 'note';
  previewData: { title?: string; domain?: string; text?: string } | null;
}

export function AddCardPreview({ previewType, previewData }: AddCardPreviewProps) {
  return (
    <div
      style={{
        marginBottom: 12,
        padding: '12px',
        borderRadius: 12,
        background: 'var(--surface-3)',
        border: '1px solid var(--border-1)',
        minHeight: 80,
      }}
    >
      {previewType === 'empty' ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            color: 'var(--text-3)',
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="M3 16l5-5 4 4 3-3 6 6" />
          </svg>
          <span style={{ fontSize: 11, fontWeight: 500 }}>Preview appears here</span>
        </div>
      ) : previewType === 'link' ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '8px',
            background: 'var(--surface-2)',
            borderRadius: 10,
            border: '1px solid var(--border-1)',
          }}
        >
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--r-md)',
              background: 'var(--surface-4)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text-3)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: 'var(--text-md)',
                fontWeight: 700,
                color: 'var(--text-1)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {previewData?.title}
            </div>
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-3)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {previewData?.domain}
            </div>
          </div>
        </div>
      ) : previewType === 'note' ? (
        <div
          style={{
            padding: '16px',
            borderRadius: 4,
            background: 'linear-gradient(135deg, #fef3c7, #fde68a)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
            transform: 'rotate(-1deg)',
          }}
        >
          <div
            style={{
              fontFamily: 'cursive',
              fontSize: 22,
              color: '#444',
              lineHeight: 1.4,
              wordBreak: 'break-word',
            }}
          >
            {previewData?.text}
          </div>
        </div>
      ) : null}
    </div>
  );
}

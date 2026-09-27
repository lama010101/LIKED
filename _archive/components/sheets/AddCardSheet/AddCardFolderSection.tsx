/**
 * Folder selection section — extracted from AddCardSheet.tsx
 */

import { CheckIcon } from "./AddCardTypes";

interface AddCardFolderSectionProps {
  availableFolders: { id: string; name: string; colorHex: string }[];
  selectedFolder: string | null;
  onToggleFolder: (id: string) => void;
}

export function AddCardFolderSection({
  availableFolders,
  selectedFolder,
  onToggleFolder,
}: AddCardFolderSectionProps) {
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
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <span>Save to folder</span>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
        }}
      >
        {availableFolders.map((folder) => {
          const isSelected = selectedFolder === folder.id;
          return (
            <button
              key={folder.id}
              onClick={() => onToggleFolder(folder.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                padding: 0,
              }}
            >
              <div
                style={{
                  width: 80,
                  height: 68,
                  borderRadius: 'var(--r-md)',
                  background: folder.colorHex,
                  border: isSelected ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'border-color var(--transition-fast)',
                  position: 'relative',
                }}
              >
                {isSelected && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: -5,
                      right: -5,
                      width: 18,
                      height: 18,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      border: '2.5px solid var(--surface-2)',
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
                  fontSize: 'var(--text-sm)',
                  color: isSelected ? 'var(--accent)' : 'var(--text-2)',
                  fontWeight: isSelected ? 700 : 500,
                  textAlign: 'center',
                }}
              >
                {folder.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

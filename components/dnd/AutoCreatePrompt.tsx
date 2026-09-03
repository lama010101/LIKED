'use client';

import { useState, useEffect, useRef } from 'react';
import { useUIStore } from '@/lib/store/uiStore';
import { dndAutoCreateFolder, dndAutoCreateGroup } from '@/app/lib/actions/dnd';

export default function AutoCreatePrompt() {
  const autoCreatePrompt = useUIStore((s) => s.autoCreatePrompt);
  const clearAutoCreatePrompt = useUIStore((s) => s.clearAutoCreatePrompt);
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when prompt opens
  useEffect(() => {
    if (autoCreatePrompt && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoCreatePrompt]);

  // Reset state when prompt closes
  useEffect(() => {
    if (!autoCreatePrompt) {
      setName('');
      setError(null);
      setIsSubmitting(false);
    }
  }, [autoCreatePrompt]);

  if (!autoCreatePrompt) return null;

  const { type, pendingIds } = autoCreatePrompt;
  const placeholder = type === 'folder' ? 'Name this folder…' : 'Name this group…';
  const title = type === 'folder' ? 'Create Folder' : 'Create Group';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(`${type === 'folder' ? 'Folder' : 'Group'} name is required`);
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let result;
      if (type === 'folder') {
        result = await dndAutoCreateFolder(trimmed, pendingIds);
      } else {
        result = await dndAutoCreateGroup(trimmed, pendingIds);
      }

      if (result.ok) {
        clearAutoCreatePrompt();
        // Feed refresh is handled by revalidatePath in server action
      } else {
        setError(result.error || `Failed to create ${type}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to create ${type}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    clearAutoCreatePrompt();
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create folder"
      tabIndex={-1}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface-2)',
          borderRadius: 16,
          padding: 24,
          width: '100%',
          maxWidth: 400,
          margin: 16,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.3)',
          border: '1px solid var(--border-1)',
        }}
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--text-1)',
            marginBottom: 16,
          }}
        >
          {title}
        </h2>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder}
            disabled={isSubmitting}
            autoFocus
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: 15,
              borderRadius: 10,
              border: '1px solid var(--border-1)',
              background: 'var(--surface-1)',
              color: 'var(--text-1)',
              outline: 'none',
              marginBottom: 16,
              transition: 'border-color 0.15s',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'var(--accent)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'var(--border-1)';
            }}
          />

          {error && (
            <div
              style={{
                fontSize: 13,
                color: 'var(--red, #dc2626)',
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              onClick={handleCancel}
              disabled={isSubmitting}
              style={{
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 10,
                border: '1px solid var(--border-1)',
                background: 'var(--surface-1)',
                color: 'var(--text-2)',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim()}
              style={{
                padding: '10px 20px',
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 10,
                border: 'none',
                background: isSubmitting ? 'var(--surface-3)' : 'var(--accent)',
                color: '#fff',
                cursor: isSubmitting || !name.trim() ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
                opacity: isSubmitting || !name.trim() ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {isSubmitting ? (
                <>
                  <svg
                    width={16}
                    height={16}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ animation: 'spin 1s linear infinite' }}
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Creating…
                </>
              ) : (
                'Create'
              )}
            </button>
          </div>
        </form>
      </div>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

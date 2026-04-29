'use client';

import { useState, useMemo, useEffect } from 'react';
import { useFilterStore } from '@/lib/store/filterStore';
import { getVisibleTags } from '@/lib/db/tags';

interface TagChip {
  id: string;
  label: string;
  color: string;
}

interface TagsStripProps {
  visible?: boolean;
  userId: string;
  languageCode: string;
}

export default function TagsStrip({ visible = true, userId, languageCode }: TagsStripProps) {
  const [search, setSearch] = useState('');
  const [tags, setTags] = useState<TagChip[]>([]);
  const [loading, setLoading] = useState(true);
  const tagIds = useFilterStore((s) => s.tagIds);
  const toggleTagFilter = useFilterStore((s) => s.toggleTagFilter);

  // Load visible tags on mount
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    
    getVisibleTags(userId, languageCode || 'en')
      .then((visibleTags) => {
        if (!cancelled) {
          setTags(visibleTags.map((t) => ({
            id: t.id,
            label: t.label,
            color: t.color_hex,
          })));
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('Failed to load visible tags:', err);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, languageCode]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.label.toLowerCase().includes(q));
  }, [search, tags]);

  if (!visible) return null;

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          padding: '8px var(--space-md)',
          flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
          Loading tags...
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '8px var(--space-md)',
        flexShrink: 0,
        animation: 'subtab-slide .2s ease-out',
      }}
    >
      {/* Search row */}
      <div
        className="search-field"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'var(--surface-1)',
          border: '1px solid var(--border-1)',
          borderRadius: 'var(--r-md)',
          padding: '6px 10px',
          transition: 'border-color var(--transition-fast)',
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
          style={{ color: 'var(--text-3)', flexShrink: 0 }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tags…"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: 'var(--text-base)',
            color: 'var(--text-1)',
            minWidth: 0,
          }}
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="Clear search"
            style={{
              width: 16,
              height: 16,
              borderRadius: 'var(--r-full)',
              background: 'var(--surface-3)',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              color: 'var(--text-3)',
              padding: 0,
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* Tag chips row */}
      <div
        className="hide-scrollbar"
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          flexWrap: 'nowrap',
          paddingBottom: 2,
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
            No tags found
          </div>
        ) : (
          filtered.map((tag) => {
          const isActive = tagIds.includes(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTagFilter(tag.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 10px',
                borderRadius: 'var(--r-full)',
                fontSize: 'var(--text-sm)',
                fontWeight: 700,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                cursor: 'pointer',
                border: isActive
                  ? `2px solid ${tag.color}`
                  : '1px solid var(--border-1)',
                background: isActive
                  ? `${tag.color}18`
                  : 'var(--surface-1)',
                color: isActive ? tag.color : 'var(--text-2)',
                transition: 'all var(--transition-fast)',
              }}
            >
              {isActive && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={tag.color}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ flexShrink: 0 }}
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
              {tag.label}
            </button>
          );
        })
      )}
      </div>
    </div>
  );
}

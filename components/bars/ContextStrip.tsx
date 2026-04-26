'use client';

export type ContextPillType = 'tag' | 'friend' | 'folder' | 'search';

export interface ContextPill {
  id: string;
  label: string;
  type: ContextPillType;
  color?: string;
  avatar?: string;
}

interface ContextStripProps {
  pills: ContextPill[];
  onRemove: (id: string, type: ContextPillType) => void;
  onClearAll: () => void;
}

export default function ContextStrip({ pills, onRemove, onClearAll }: ContextStripProps) {
  if (pills.length === 0) return null;

  return (
    <div className="context-strip">
      <div className="context-pills">
        {pills.map((pill) => {
          const isTag = pill.type === 'tag';
          const isFriend = pill.type === 'friend';
          const cls = `context-pill${isFriend ? ' context-pill--friend' : ''}${isTag ? ' context-pill--tag' : ''}`;
          return (
            <button
              key={`${pill.type}-${pill.id}`}
              type="button"
              onClick={() => onRemove(pill.id, pill.type)}
              className={cls}
            >
              {isFriend && pill.avatar && (
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: pill.avatar,
                    flexShrink: 0,
                    display: 'inline-block',
                  }}
                />
              )}
              {pill.label}
              <span className="context-pill__x" aria-hidden="true">×</span>
            </button>
          );
        })}
      </div>

      {pills.length >= 1 && (
        <button type="button" onClick={onClearAll} className="context-clear">
          Clear all
        </button>
      )}
    </div>
  );
}

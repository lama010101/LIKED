'use client';

export type MineSubTab = 'all' | 'not-shared' | 'shared';

const subTabs = [
  { id: 'all' as MineSubTab, label: 'All' },
  { id: 'not-shared' as MineSubTab, label: 'Not shared' },
  { id: 'shared' as MineSubTab, label: 'Shared' },
];

interface MineSubTabsProps {
  activeSubTab: MineSubTab;
  onSubTabChange: (subTab: MineSubTab) => void;
  scope?: 'mine' | 'received';
}

export default function MineSubTabs({ activeSubTab, onSubTabChange, scope = 'mine' }: MineSubTabsProps) {
  return (
    <div className="subtabs" data-scope={scope}>
      {subTabs.map((st) => {
        const isActive = activeSubTab === st.id;
        return (
          <button
            key={st.id}
            data-subtab={st.id}
            onClick={() => onSubTabChange(st.id)}
            aria-pressed={isActive}
            className={`subtab${isActive ? ' subtab--active' : ''}`}
          >
            <span className="subtab__dot" />
            {st.label}
          </button>
        );
      })}
    </div>
  );
}

'use client';

const tabs = [
  { id: 'all', label: 'All' },
  { id: 'mine', label: 'Mine' },
  { id: 'received', label: 'Received' },
] as const;

export type TabId = typeof tabs[number]['id'];

interface FeedTabsProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export default function FeedTabs({ activeTab, onTabChange }: FeedTabsProps) {
  return (
    <div className="feed-tabs">
      {tabs.map((t) => {
        const isActive = activeTab === t.id;
        return (
          <button
            key={t.id}
            data-tab={t.id}
            onClick={() => onTabChange(t.id)}
            className={`feed-tab${isActive ? ' feed-tab--active' : ''}`}
          >
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

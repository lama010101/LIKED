export interface FeedItem {
  id: string;
  kind: 'card' | 'folder';
  title: string;
  art: string;
  tag?: string;
  tagColor?: string;
  rating?: number;
  dir?: 'mine' | 'received';
  sentTo?: string[];
  source?: string;
  daysAgo?: number;
  folderColor?: string;
  folderCount?: number;
}

export interface ViewProps {
  items: FeedItem[];
  zoom?: number;
  scopeKey?: string;
  onItemClick: (item: FeedItem) => void;
}

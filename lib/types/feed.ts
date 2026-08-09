export interface FeedItem {
  id: string;
  kind: 'card' | 'folder';
  title: string;
  art: string;
  thumbnailKey?: string | null;
  ownerId?: string;
  tag?: string;
  tagColor?: string;
  rating?: number;
  dir?: 'mine' | 'received' | 'sent';
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

/**
 * Application-specific type definitions
 */

// Feed types
export type FeedView = "masonry" | "icon" | "list" | "horizontal" | "canvas";
export type FeedState = "all" | "mine" | "received";
export type SortOption = "newest" | "oldest" | "mostShared" | "highestRated" | "custom";

// Node types
export interface Node {
  id: string;
  url: string | null;
  text_content: string | null;
  title: string | null;
  thumbnail_key: string | null;
  owner_id: string;
  language_code: string;
  origin_user_id: string;
  origin_created_at: string;
  deleted_at: string | null;
  created_at: string;
}

export type NodeInput = {
  url?: string;
  textContent?: string;
};

// User types
export interface User {
  id: string;
  display_name: string | null;
  normalized_display_name: string | null;
  language_code: string;
  avatar_key: string | null;
}

// Edge types
export interface Edge {
  id: string;
  node_id: string;
  user_id: string;
  cause_id: string;
  sender_id: string;
  direction: "sent" | "received";
  depth: number;
  permission: Permission;
  created_at: string;
}

// Cause types
export type CauseType = "direct_share" | "group_share" | "import";

export interface Cause {
  id: string;
  cause_type: CauseType;
  created_by: string;
  metadata: Record<string, Json>;
  created_at: string;
}

// Permission types
export type Permission = 'view' | 'comment' | 'contribute' | 'edit' | 'reshare' | 'admin';

export const PERMISSION_RANK: Record<Permission, number> = {
  view: 1,
  comment: 2,
  contribute: 3,
  edit: 4,
  reshare: 5,
  admin: 6,
};

// Folder types
export interface Folder {
  id: string;
  name: string;
  owner_id: string;
  parent_folder_id: string | null;
  is_project: boolean;
  color_hex: string;
  deleted_at: string | null;
  created_at: string;
}

// Tag types
export interface Tag {
  id: string;
  color_hex: string;
  created_at: string;
}

// Group types
export interface Group {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

// Rating types
export interface Rating {
  id: string;
  node_id: string;
  user_id: string;
  score: number;
  updated_at: string;
}

// JSON utility type
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// Filter types
export interface FeedFilters {
  tags: string[];
  folders: string[];
  friends: string[];
  groups: string[];
}

// UI types
export type Theme = "light" | "dark";

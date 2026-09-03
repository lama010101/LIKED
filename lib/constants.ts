/**
 * Application constants
 */

// Rate limits per PRD §32
export const RATE_LIMITS = {
  // Username changes: 1 per 24 hours
  USERNAME_CHANGE: {
    max: 1,
    windowHours: 24,
  },
  // Avatar changes: 5 per day
  AVATAR_CHANGE: {
    max: 5,
    windowHours: 24,
  },
} as const;

// Display name constraints per PRD §32.3
export const DISPLAY_NAME = {
  minLength: 3,
  maxLength: 32,
} as const;

// Folder constraints per PRD §4.3
export const FOLDER = {
  maxDepth: 5,
  nameMinLength: 1,
  nameMaxLength: 64,
} as const;

// Rating constraints per PRD §18
export const RATING = {
  min: 0,
  max: 10,
  step: 0.5,
} as const;

// Pagination
export const PAGINATION = {
  defaultPageSize: 20,
  maxPageSize: 100,
  /** First-page load size (SSR + client first fetch) — shared by
   *  lib/db/feed.ts (server) and lib/hooks/useFeed.ts (client). */
  initialLoadSize: 30,
} as const;

// UI constants
export const UI = {
  // Tap target minimum size per PRD §11
  minTapTarget: 44, // px
  
  // FAB positioning per PRD §11.3
  fabBottomOffset: 24, // px above folders bar
  
  // Avatar display per PRD §11.4
  avatarsVisibleMobile: 5,
  maxVisibleAvatars: 3, // on folder chips
  
  // Bar heights
  topBarHeight: 64, // px
  barHeight: 56, // px
  
  // Animations per PRD §12
  dragLiftTransition: 100, // ms
  dragScale: 1.05,
  dragOffsetMobile: -80, // px upward
  dragOffsetDesktop: { x: 8, y: -8 }, // px diagonal
  
  // Double tap detection per PRD §11.4
  doubleTapDelay: 250, // ms
} as const;

// Cache keys
export const CACHE_KEYS = {
  THEME: "liked-theme",
  VIEW_PREFERENCE: "liked-view-preference",
} as const;

// Language
export const DEFAULT_LANGUAGE = "en" as const;

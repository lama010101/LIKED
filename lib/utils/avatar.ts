/**
 * Avatar utilities
 * P1-T04 implementation placeholder
 */

// Isomorphic deterministic hash (djb2) — no node:crypto so this module
// is safe to import from client components (Avatar disk color).
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

// 20-color palette for deterministic color assignment
const AVATAR_PALETTE = [
  "#ef4444", // red-500
  "#f97316", // orange-500
  "#f59e0b", // amber-500
  "#84cc16", // lime-500
  "#22c55e", // green-500
  "#10b981", // emerald-500
  "#14b8a6", // teal-500
  "#06b6d4", // cyan-500
  "#0ea5e9", // sky-500
  "#3b82f6", // blue-500
  "#6366f1", // indigo-500
  "#8b5cf6", // violet-500
  "#a855f7", // purple-500
  "#d946ef", // fuchsia-500
  "#ec4899", // pink-500
  "#f43f5e", // rose-500
  "#78716c", // stone-500
  "#6b7280", // gray-500
  "#71717a", // zinc-500
  "#64748b", // slate-500
];

/**
 * Get deterministic color from user ID
 */
export function getAvatarColor(userId: string): string {
  return AVATAR_PALETTE[hashString(userId) % AVATAR_PALETTE.length];
}

/**
 * Get initials from display name (up to 2 characters)
 */
export function getAvatarInitials(displayName: string | null): string {
  if (!displayName) return "?";
  
  const parts = displayName.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Generate SVG data URL for default avatar
 */
export function generateDefaultAvatarSvg(
  userId: string,
  displayName: string | null
): string {
  const color = getAvatarColor(userId);
  const initials = getAvatarInitials(displayName);
  
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <rect width="128" height="128" fill="${color}" rx="8"/>
      <text 
        x="64" 
        y="64" 
        text-anchor="middle" 
        dominant-baseline="central" 
        fill="white" 
        font-family="system-ui, sans-serif" 
        font-size="48" 
        font-weight="600"
      >
        ${initials}
      </text>
    </svg>
  `.trim();
  
  const bytes = new TextEncoder().encode(svg);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:image/svg+xml;base64,${btoa(bin)}`;
}

/**
 * Get avatar URL - either storage URL or generated default
 * Per PRD §32.4
 */
export function getAvatarUrl(
  userId: string,
  avatarKey: string | null,
  displayName: string | null,
  storageBaseUrl?: string
): string {
  if (avatarKey && storageBaseUrl) {
    // Return Supabase Storage public URL
    return `${storageBaseUrl}/object/public/${avatarKey}`;
  }

  // Generate deterministic default avatar
  return generateDefaultAvatarSvg(userId, displayName);
}

/**
 * Get Supabase Storage URL for a given bucket and key
 * TAD §13.3 pattern
 */
export function getStorageUrl(bucket: 'avatars' | 'thumbnails', key: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${key}`;
}

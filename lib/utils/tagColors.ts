/**
 * Tag color utilities
 */

// 20-color palette for tags and folders
export const TAG_PALETTE = [
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
 * Get next color from palette (cycles if exhausted)
 */
export function getNextTagColor(index: number): string {
  return TAG_PALETTE[index % TAG_PALETTE.length];
}

/**
 * Get color with opacity for backgrounds
 */
export function getTagColorWithOpacity(
  colorHex: string,
  opacity: number = 0.2
): string {
  // Convert hex to RGB
  const r = parseInt(colorHex.slice(1, 3), 16);
  const g = parseInt(colorHex.slice(3, 5), 16);
  const b = parseInt(colorHex.slice(5, 7), 16);
  
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

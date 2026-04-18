/**
 * String normalization utilities
 */

/**
 * Normalize display name for identity deduplication
 * Per PRD §32.3
 * - Lowercase
 * - Trim whitespace
 * - NFKC Unicode normalization
 */
export function normalizeDisplayName(displayName: string): string {
  return displayName
    .trim()
    .toLowerCase()
    .normalize("NFKC");
}

/**
 * Generate unique normalized name with suffix on conflict
 */
export function generateUniqueNormalizedName(
  baseName: string,
  existingNames: Set<string>
): string {
  let normalized = normalizeDisplayName(baseName);
  
  if (!existingNames.has(normalized)) {
    return normalized;
  }
  
  // Append random suffix
  const suffix = Math.random().toString(36).slice(2, 6);
  normalized = `${normalized}_${suffix}`;
  
  return normalized;
}

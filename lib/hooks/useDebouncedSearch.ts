/**
 * Debounced search input hook
 * P9-T04: Search Input System
 *
 * Emits only stabilized values after the specified delay.
 * Cancels previous timer on change.
 *
 * Compliance: 01_PRD.md §16 (filtering), §33 (search behavior)
 *             04_FEED_SQL_SPEC.md (search query handling)
 */

import { useState, useEffect, useRef } from 'react';

/**
 * Debounce a raw input value.
 *
 * @param rawValue - The raw input value (e.g., user typing)
 * @param delayMs - Debounce delay in milliseconds (default: 300)
 * @returns The debounced value (only updates after delay of stability)
 *
 * Example:
 * ```ts
 * const [input, setInput] = useState('');
 * const debounced = useDebouncedSearch(input, 300);
 * ```
 */
export function useDebouncedSearch<T>(rawValue: T, delayMs = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(rawValue);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Cancel previous timer
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timer
    timeoutRef.current = setTimeout(() => {
      setDebouncedValue(rawValue);
    }, delayMs);

    // Cleanup on unmount or value change
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [rawValue, delayMs]);

  return debouncedValue;
}

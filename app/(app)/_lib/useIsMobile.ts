"use client";

import { useEffect, useState } from "react";

/**
 * useIsMobile — extracted from app/(app)/layout.tsx
 * Returns true when viewport is below lg (1024px).
 * Initializes to false to avoid hydration mismatch, then
 * updates via queueMicrotask in useEffect.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1023px)");
    queueMicrotask(() => setIsMobile(mediaQuery.matches));

    const handleChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isMobile;
}

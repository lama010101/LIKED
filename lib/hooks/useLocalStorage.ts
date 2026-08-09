'use client';

import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const s = localStorage.getItem(key);
      return s !== null ? (JSON.parse(s) as T) : initial;
    } catch {
      return initial;
    }
  });
  const [isHydrated, setIsHydrated] = useState(() => typeof window !== 'undefined');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    queueMicrotask(() => setIsHydrated(true));
    try {
      const s = localStorage.getItem(key);
      if (s !== null) {
        queueMicrotask(() => setV(JSON.parse(s) as T));
      }
    } catch {}
  }, [key]);

  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {}
  }, [key, v, isHydrated]);

  return [v, setV];
}

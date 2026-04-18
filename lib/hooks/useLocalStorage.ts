'use client';

import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(initial);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
    try {
      const s = localStorage.getItem(key);
      if (s !== null) {
        setV(JSON.parse(s));
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

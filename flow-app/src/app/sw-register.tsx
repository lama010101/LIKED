"use client";

import { useEffect } from "react";

/** Registers /sw.js in production builds (runtime cache-first). */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // SW registration is best-effort (e.g. unsupported contexts)
    });
  }, []);
  return null;
}

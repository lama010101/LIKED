"use client";

import { useEffect } from "react";
import { useToastStore } from "@/lib/store/toastStore";

/**
 * Minimal toast renderer for the MVP2 UI — reads the shared toastStore
 * (lib infra, unchanged). Auto-dismisses after each toast's duration.
 */
export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    const timers = toasts
      .filter((t) => t.duration > 0)
      .map((t) => setTimeout(() => dismiss(t.id), t.duration));
    return () => timers.forEach(clearTimeout);
  }, [toasts, dismiss]);

  if (toasts.length === 0) return null;
  return (
    <div className="toaster" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dismiss(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

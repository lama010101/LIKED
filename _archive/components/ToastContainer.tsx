"use client";

/**
 * Global toast renderer. Mount once in app/layout.tsx.
 * Reads toasts from the Zustand toastStore and auto-dismisses them.
 */

import { useEffect } from "react";
import { useToastStore, type Toast } from "@/lib/store/toastStore";

const COLORS: Record<Toast["type"], { bg: string; icon: string }> = {
  success: { bg: "var(--accent, #7c5cfc)", icon: "\u2713" },
  error: { bg: "var(--red, #ef4444)", icon: "\u26A0" },
  info: { bg: "var(--surface-4, #333)", icon: "\u2139" },
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const { bg, icon } = COLORS[toast.type];

  useEffect(() => {
    if (toast.duration <= 0) return;
    const timer = setTimeout(onDismiss, toast.duration);
    return () => clearTimeout(timer);
  }, [toast.duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live={toast.type === "error" ? "assertive" : "polite"}
      onClick={onDismiss}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 16px",
        background: bg,
        color: "#fff",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 600,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        cursor: "pointer",
        maxWidth: 360,
        animation: "toast-in 0.2s ease-out",
        pointerEvents: "auto",
      }}
    >
      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column-reverse",
        gap: 8,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>
  );
}

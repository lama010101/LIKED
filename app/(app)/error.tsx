"use client";

/**
 * Next.js App Router error boundary for the (app) route group.
 * Catches errors thrown in any server or client component within the
 * authenticated layout segment. Provides a "Back to feed" link so users
 * can recover without reloading the whole app.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[AppErrorBoundary]", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 400, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>&#128533;</div>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text-1, #111)",
            marginBottom: 8,
          }}
        >
          Something went wrong
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-2, #666)",
            marginBottom: 24,
            lineHeight: 1.5,
          }}
        >
          {error.message || "An unexpected error occurred."}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
          <button
            onClick={reset}
            style={{
              padding: "10px 24px",
              background: "var(--accent, #7c5cfc)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <button
            onClick={() => router.push("/feed")}
            style={{
              padding: "10px 24px",
              background: "transparent",
              color: "var(--text-2, #666)",
              border: "1px solid var(--border-1, #e5e7eb)",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Back to feed
          </button>
        </div>
      </div>
    </div>
  );
}

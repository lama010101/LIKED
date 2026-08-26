"use client";

/**
 * Next.js App Router root error boundary.
 * Catches errors that escape all other error.tsx boundaries.
 * Must render its own <html> and <body> tags.
 */

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg, #fff)",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 400,
            padding: 32,
            textAlign: "center",
          }}
        >
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
            An unexpected error occurred. Try reloading the page.
          </p>
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
        </div>
      </body>
    </html>
  );
}

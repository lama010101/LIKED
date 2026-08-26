/**
 * Next.js App Router 404 page.
 * Renders when no route matches the requested path.
 */

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--bg, #fff)",
      }}
    >
      <div style={{ maxWidth: 400, textAlign: "center" }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>&#128270;</div>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: "var(--text-1, #111)",
            marginBottom: 8,
            letterSpacing: "-0.02em",
          }}
        >
          Page not found
        </h1>
        <p
          style={{
            fontSize: 14,
            color: "var(--text-2, #666)",
            marginBottom: 24,
            lineHeight: 1.5,
          }}
        >
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <a
          href="/feed"
          style={{
            display: "inline-block",
            padding: "10px 24px",
            background: "var(--accent, #7c5cfc)",
            color: "#fff",
            borderRadius: 10,
            fontSize: 14,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Back to feed
        </a>
      </div>
    </div>
  );
}

/**
 * YouTubeSkeleton — extracted from youtube/page.tsx
 * Loading skeleton shown while checking YouTube connection status.
 */

export default function YouTubeSkeleton() {
  return (
    <div style={{ minHeight: "100vh", padding: 20 }}>
      <div style={{
        height: 52,
        background: "var(--surface-2, #f9f9f9)",
        borderRadius: 12,
        marginBottom: 16,
        animation: "skeleton-pulse 1.5s ease-in-out infinite",
      }} />
      <div style={{
        height: 44,
        background: "var(--surface-2, #f9f9f9)",
        borderRadius: 12,
        marginBottom: 16,
        animation: "skeleton-pulse 1.5s ease-in-out infinite",
      }} />
      {[1, 2, 3].map((i) => (
        <div key={i} style={{
          display: "flex",
          gap: 12,
          padding: 12,
          background: "var(--surface-2, #f9f9f9)",
          borderRadius: 12,
          marginBottom: 12,
          animation: "skeleton-pulse 1.5s ease-in-out infinite",
        }}>
          <div style={{ width: 120, height: 68, borderRadius: 8, background: "var(--surface-3, #eee)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 14, borderRadius: 4, background: "var(--surface-3, #eee)", marginBottom: 8, width: "60%" }} />
            <div style={{ height: 12, borderRadius: 4, background: "var(--surface-3, #eee)", width: "30%" }} />
          </div>
        </div>
      ))}
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

export default function FeedLoading() {
  return (
    <div style={{ minHeight: "100vh", padding: "16px" }}>
      {/* Top bar skeleton */}
      <div style={{
        height: 48,
        background: "var(--surface-2)",
        borderRadius: 12,
        marginBottom: 16,
      }} />
      {/* Card grid skeleton */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 16,
      }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} style={{
            background: "var(--surface-2)",
            borderRadius: 12,
            overflow: "hidden",
          }}>
            <div style={{ height: 120, background: "var(--surface-3)" }} />
            <div style={{ padding: 12 }}>
              <div style={{ height: 14, borderRadius: 4, background: "var(--surface-3)", marginBottom: 8, width: "80%" }} />
              <div style={{ height: 12, borderRadius: 4, background: "var(--surface-3)", width: "40%" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

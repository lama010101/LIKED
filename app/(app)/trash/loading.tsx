export default function TrashLoading() {
  return (
    <div style={{ minHeight: "100vh", padding: "16px" }}>
      <div style={{
        height: 48,
        background: "var(--surface-2)",
        borderRadius: 12,
        marginBottom: 16,
      }} />
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
        gap: 16,
      }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{
            background: "var(--surface-2)",
            borderRadius: 12,
            overflow: "hidden",
            opacity: 0.6,
          }}>
            <div style={{ height: 100, background: "var(--surface-3)" }} />
            <div style={{ padding: 12 }}>
              <div style={{ height: 14, borderRadius: 4, background: "var(--surface-3)", marginBottom: 8, width: "70%" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

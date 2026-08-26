export default function YoutubeLoading() {
  return (
    <div style={{ minHeight: "100vh", padding: 20 }}>
      <div style={{
        height: 52,
        background: "var(--surface-2)",
        borderRadius: 12,
        marginBottom: 16,
      }} />
      <div style={{
        height: 44,
        background: "var(--surface-2)",
        borderRadius: 12,
        marginBottom: 16,
      }} />
      {[1, 2, 3].map((i) => (
        <div key={i} style={{
          display: "flex",
          gap: 12,
          padding: 12,
          background: "var(--surface-2)",
          borderRadius: 12,
          marginBottom: 12,
        }}>
          <div style={{ width: 120, height: 68, borderRadius: 8, background: "var(--surface-3)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ height: 14, borderRadius: 4, background: "var(--surface-3)", marginBottom: 8, width: "60%" }} />
            <div style={{ height: 12, borderRadius: 4, background: "var(--surface-3)", width: "30%" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

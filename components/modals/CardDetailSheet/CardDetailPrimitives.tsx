/**
 * Primitive UI components — extracted from CardDetailSheet.tsx
 */

import type { CSSProperties } from "react";

export function Pill({
  icon,
  label,
  hint,
}: {
  icon: string;
  label: string;
  hint: string;
}) {
  return (
    <span
      title={hint}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "4px 8px",
        fontSize: 11,
        fontWeight: 600,
        color: "var(--text-2)",
        background: "var(--surface-3)",
        borderRadius: 999,
        border: "1px solid var(--border-1)",
      }}
    >
      <span aria-hidden="true">{icon}</span>
      {label}
    </span>
  );
}

export function iconBtn(): CSSProperties {
  return {
    width: 30,
    height: 30,
    borderRadius: 8,
    background: "var(--surface-3)",
    color: "var(--text-2)",
    border: "1px solid var(--border-1)",
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
    padding: 0,
  };
}

export function actionBtn(variant: "neutral" | "danger"): CSSProperties {
  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: "10px 12px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 10,
    cursor: "pointer",
    border: "1px solid var(--border-1)",
  };
  if (variant === "danger") {
    return {
      ...base,
      background: "transparent",
      color: "var(--red, #ff6b6b)",
      borderColor: "var(--red, #ff6b6b)55",
    };
  }
  return {
    ...base,
    background: "var(--surface-3)",
    color: "var(--text-1)",
  };
}

export function LoadingSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          width: "100%",
          aspectRatio: "16 / 9",
          background: "var(--surface-3)",
          borderRadius: 12,
        }}
      />
      <div style={{ height: 20, width: "70%", background: "var(--surface-3)", borderRadius: 6 }} />
      <div style={{ height: 14, width: "50%", background: "var(--surface-3)", borderRadius: 6 }} />
    </div>
  );
}

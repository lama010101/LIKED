import type { ReactNode } from "react";

const DATA_UI_V2 = "v2";

// v2 route shell (PLAN-V2-002 §7.3, task P0-08): every v2 route group
// wraps its pages in this component so [data-ui="v2"] scopes the token
// layer in app/v2-tokens.css. Legacy pages keep globals.css untouched.
export default function V2Shell({ children }: { children: ReactNode }) {
  // bg/text/min-h keep v2 routes self-contained: they have no ThemeSync, so
  // under data-theme="system" the legacy globals.css tokens stay dark while
  // the v2 vars flip with prefers-color-scheme (axe color-contrast).
  return (
    <div data-ui={DATA_UI_V2} className="min-h-dvh bg-[var(--v2-bg)] text-[var(--v2-text)]">
      {children}
    </div>
  );
}

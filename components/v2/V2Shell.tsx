import type { ReactNode } from "react";

const DATA_UI_V2 = "v2";

// v2 route shell (PLAN-V2-002 §7.3, task P0-08): every v2 route group
// wraps its pages in this component so [data-ui="v2"] scopes the token
// layer in app/v2-tokens.css. Legacy pages keep globals.css untouched.
export default function V2Shell({ children }: { children: ReactNode }) {
  return <div data-ui={DATA_UI_V2}>{children}</div>;
}

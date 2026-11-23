"use client";

import { useEffect } from "react";
import { LANDING_COOKIE, type LandingVariant } from "./config";

// Writes / clears the functional SESSION cookie "liked.landing" for the
// landing switch (V2-LANDING-002-A). Rendered only when the server saw
// ?landing=<variant> (set) or ?landing=default (clear). A Server Component
// cannot set cookies, and the switch deliberately does not touch proxy.ts
// (auth), so the write happens here. No Max-Age/Expires = session cookie.
export default function LandingOverrideSync({ action, variant }: { action: "set" | "clear"; variant?: LandingVariant }) {
  useEffect(() => {
    try {
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      if (action === "set" && variant) {
        document.cookie = `${LANDING_COOKIE}=${variant}; Path=/; SameSite=Lax${secure}`;
      } else if (action === "clear") {
        document.cookie = `${LANDING_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
      }
    } catch {
      /* cookies blocked: the query override still applies for this view */
    }
  }, [action, variant]);
  return null;
}

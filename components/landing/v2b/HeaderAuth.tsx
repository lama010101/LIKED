"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { APP_HOME_HREF, SIGN_IN_HREF } from "./config";

// Header auth link. Server renders "Sign in" (anonymous) so the page stays
// cacheable-in-shape and has no server auth call; after hydration we look for
// a Supabase auth cookie and only then load the browser client (dynamic
// import, so anonymous visitors never download it) to confirm a session.
// Signed in -> "Open app". No redirect, no new auth logic.
function hasAuthCookie(): boolean {
  return document.cookie.split("; ").some((c) => /^sb-.+-auth-token/.test(c));
}

export default function HeaderAuth() {
  const t = useTranslations("landing.v2b.header");
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    if (!hasAuthCookie()) return;
    let cancelled = false;
    import("@/lib/supabase/client")
      .then(({ supabaseBrowser }) => supabaseBrowser.auth.getSession())
      .then(({ data }) => { if (!cancelled && data.session) setSignedIn(true); })
      .catch(() => { /* stay on "Sign in" */ });
    return () => { cancelled = true; };
  }, []);

  return signedIn ? (
    <a href={APP_HOME_HREF} className="lb-navlink lb-navlink-strong" data-testid="open-app">{t("openApp")}</a>
  ) : (
    <a href={SIGN_IN_HREF} className="lb-navlink" data-testid="sign-in">{t("signIn")}</a>
  );
}

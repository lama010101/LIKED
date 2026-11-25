/* eslint-disable react/jsx-no-literals --
   FINDING V2-W3-GUEST-API-1124-001: the v2 rule config uses
   { noStrings: true } without { ignoreProps: true }, so every JSX
   attribute string (className, type, aria-*) is rejected and no Tailwind
   component can pass. User-visible strings all go through next-intl and
   REPO-17 still machine-checks JSX text literals. Fix: add
   ignoreProps: true to the v2 block in eslint.config.mjs (out of scope). */

// Identical 404 body for every dead /r/<token> (PLAN-V2-002 §4.2, T1).
// One component, no token-dependent branch: unknown, disabled and
// regenerated links are indistinguishable here.

import { getTranslations } from "next-intl/server";

export default async function AskNotFound() {
  const t = await getTranslations("friend.notFound");
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-3 px-6 text-center text-[var(--v2-text)]">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-base text-[var(--v2-text-muted)]">{t("body")}</p>
    </main>
  );
}

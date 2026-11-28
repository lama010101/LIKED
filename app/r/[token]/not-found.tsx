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

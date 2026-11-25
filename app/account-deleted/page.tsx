import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function AccountDeletedPage() {
  const t = await getTranslations("deletion");
  return (
    <main>
      <h1>{t("deletedTitle")}</h1>
      <p>{t("deletedBody")}</p>
      <a href="/">{t("backHome")}</a>
    </main>
  );
}

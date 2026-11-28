import Link from "next/link";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

const HOME_HREF = "/";

export default async function AccountDeletedPage() {
  const t = await getTranslations("deletion");
  return (
    <main>
      <h1>{t("deletedTitle")}</h1>
      <p>{t("deletedBody")}</p>
      <Link href={HOME_HREF}>{t("backHome")}</Link>
    </main>
  );
}

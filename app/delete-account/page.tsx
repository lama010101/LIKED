import Link from "next/link";
import { getTranslations } from "next-intl/server";
import DeleteRequestForm from "./_components/DeleteRequestForm";

export const dynamic = "force-dynamic";

const LOGIN_DELETE_HREF = "/login?next=/settings/delete";

export default async function PublicDeleteAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const t = await getTranslations("deletion");
  const { status } = await searchParams;
  return (
    <main>
      <h1>{t("pubTitle")}</h1>
      <p>{t("pubIntro")}</p>
      <p>
        <Link href={LOGIN_DELETE_HREF}>{t("pubSignIn")}</Link>
      </p>
      <h2>{t("pubFormTitle")}</h2>
      {status === "confirmed" ? <p>{t("pubStatusConfirmed")}</p> : null}
      {status === "invalid" ? <p>{t("pubStatusInvalid")}</p> : null}
      <DeleteRequestForm />
      <p>{t("pubGuestsNote")}</p>
    </main>
  );
}

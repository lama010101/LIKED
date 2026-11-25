import { getTranslations } from "next-intl/server";
import DeleteRequestForm from "./_components/DeleteRequestForm";

export const dynamic = "force-dynamic";

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
        <a href="/login?next=/settings/delete">{t("pubSignIn")}</a>
      </p>
      <h2>{t("pubFormTitle")}</h2>
      {status === "confirmed" ? <p>{t("pubStatusConfirmed")}</p> : null}
      {status === "invalid" ? <p>{t("pubStatusInvalid")}</p> : null}
      <DeleteRequestForm />
      <p>{t("pubGuestsNote")}</p>
    </main>
  );
}

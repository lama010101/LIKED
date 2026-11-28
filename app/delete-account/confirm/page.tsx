import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import ConfirmDeletionButton from "./_components/ConfirmDeletionButton";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("deletion");
  return {
    title: t("confirmTitle"),
    referrer: "no-referrer",
    robots: { index: false, follow: false },
  };
}

export default async function DeleteAccountConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const t = await getTranslations("deletion");
  const { t: token } = await searchParams;
  return (
    <main>
      <h1>{t("confirmTitle")}</h1>
      <p>{t("confirmIntro")}</p>
      <ConfirmDeletionButton token={token ?? ""} />
    </main>
  );
}

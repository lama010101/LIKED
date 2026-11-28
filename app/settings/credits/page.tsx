"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import styles from "@/components/v2/settings/settings.module.css";
import { ROUTES, TESTID, UI } from "@/components/v2/settings/ui-constants";

/** Credits (PRD §6.9, PLAN P0-19): the exact TMDB attribution sentence with
 *  the approved TMDB logo, plus the existing product credits. */
export default function CreditsPage() {
  const t = useTranslations("credits");
  return (
    <div className={styles.page} data-testid={TESTID.creditsPage}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href={ROUTES.settings} className={styles.backBtn} aria-label={t("back")}>
            {UI.chevron}
          </Link>
          <h1 className={styles.title}>{t("title")}</h1>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.noticeBlock}>
          <h2 className={styles.groupTitle}>{t("tmdb")}</h2>
          {/* eslint-disable-next-line @next/next/no-img-element -- approved local SVG logo */}
          <img src={ROUTES.tmdbLogo} alt={UI.empty} className={styles.tmdbLogo} />
          <p className={styles.notice}>{t("tmdbNotice")}</p>
        </section>
        <section className={styles.noticeBlock}>
          <h2 className={styles.groupTitle}>{t("justwatch")}</h2>
          <p className={styles.notice}>{t("justwatchNotice")}</p>
        </section>
        <section className={styles.noticeBlock}>
          <h2 className={styles.groupTitle}>{t("openSourceTitle")}</h2>
          <p className={styles.notice}>{t("openSource")}</p>
        </section>
      </main>
    </div>
  );
}

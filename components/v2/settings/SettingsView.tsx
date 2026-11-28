"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { LANGUAGES } from "@/lib/i18n/languages";
import { setLanguageAction, setMyPrefsAction } from "@/app/lib/actions/v2-owner";
import { toast } from "@/lib/store/toastStore";
import type { UserPrefs } from "@/components/v2/inbox/inbox-utils";
import styles from "./settings.module.css";
import { DELETE_ACCOUNT_ENABLED, ROUTES, SECTION, TESTID, UI } from "./ui-constants";

const REGION_RE = /^[A-Z]{2}$/;

/** Settings (PRD §6.9): Account, Preferences (language works; theme/colour are
 *  P1 and stay hidden), Notifications and region (IP-suggested region, email
 *  toggle), About, Session (sign out ends this device's session only), the
 *  hidden Danger zone row and the version footer. */
export default function SettingsView({
  displayName,
  email,
  prefs,
  suggestedRegion,
  version,
}: {
  displayName: string;
  email: string | null;
  prefs: UserPrefs;
  suggestedRegion: string | null;
  version: string;
}) {
  const t = useTranslations("settings");
  const router = useRouter();
  const locale = useLocale();
  const [region, setRegion] = useState(prefs.region_code ?? "");
  const [emailOn, setEmailOn] = useState(prefs.notify_email);
  const [busy, setBusy] = useState(false);

  const initials =
    displayName
      .trim()
      .replace(/\s+/g, " ")
      .split(" ")
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || UI.empty;

  const changeLanguage = async (code: string) => {
    setBusy(true);
    try {
      await setLanguageAction(code);
      toast.success(t("languageSaved"));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  const saveRegion = async () => {
    const value = region.trim().toUpperCase();
    if (value && !REGION_RE.test(value)) {
      toast.error(t("regionInvalid"));
      return;
    }
    setBusy(true);
    try {
      await setMyPrefsAction({ regionCode: value || null });
      setRegion(value);
      toast.success(t("regionSaved"));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  const useSuggestedRegion = async () => {
    if (!suggestedRegion) return;
    setBusy(true);
    try {
      await setMyPrefsAction({ regionCode: suggestedRegion });
      setRegion(suggestedRegion);
      toast.success(t("regionSaved"));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  const toggleEmail = async () => {
    const next = !emailOn;
    setEmailOn(next);
    try {
      await setMyPrefsAction({ notifyEmail: next });
      toast.success(t("emailSaved"));
    } catch (e) {
      setEmailOn(!next);
      toast.error(e instanceof Error ? e.message : t("error"));
    }
  };

  const signOut = async () => {
    setBusy(true);
    try {
      await fetch(ROUTES.signout, { method: "POST" });
      router.push(ROUTES.login);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
      setBusy(false);
    }
  };

  const showSuggestion = suggestedRegion !== null && prefs.region_code === null;

  return (
    <div className={styles.page} data-testid={TESTID.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href={ROUTES.inbox} className={styles.backBtn} aria-label={t("back")}>
            {UI.chevron}
          </Link>
          <h1 className={styles.title}>{t("title")}</h1>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.group} aria-labelledby={SECTION.account}>
          <h2 className={styles.groupTitle} id={SECTION.account}>
            {t("account")}
          </h2>
          <div className={styles.row}>
            <span className={styles.avatar}>{initials}</span>
            <span className={styles.rowMain}>
              <span className={styles.rowLabel}>{displayName}</span>
              <span className={styles.rowValue}>{email ?? t("noEmail")}</span>
            </span>
            <span className={styles.badge}>{t("signedInWithGoogle")}</span>
          </div>
          <Link href={ROUTES.me} className={styles.linkRow}>
            <span className={styles.rowMain}>{t("displayName")}</span>
            <span className={styles.chevron}>{UI.chevron}</span>
          </Link>
        </section>

        <section className={styles.group} aria-labelledby={SECTION.preferences}>
          <h2 className={styles.groupTitle} id={SECTION.preferences}>
            {t("preferences")}
          </h2>
          <div className={styles.row}>
            <span className={styles.rowMain}>
              <span className={styles.rowLabel}>{t("language")}</span>
              <span className={styles.rowHint}>{t("languageHint")}</span>
            </span>
          </div>
          <div className={styles.radioList} role={UI.radiogroup} aria-label={t("language")}>
            {LANGUAGES.map((lang) => (
              <label key={lang.code} className={styles.radioRow}>
                <input
                  type={UI.radio}
                  name={UI.languageGroup}
                  value={lang.code}
                  checked={locale === lang.code}
                  disabled={busy}
                  onChange={() => changeLanguage(lang.code)}
                  className={styles.radio}
                  data-testid={TESTID.languageOption}
                  data-language={lang.code}
                />
                <span>{lang.nativeName}</span>
              </label>
            ))}
          </div>
        </section>

        <section className={styles.group} aria-labelledby={SECTION.notifications}>
          <h2 className={styles.groupTitle} id={SECTION.notifications}>
            {t("notificationsRegion")}
          </h2>
          <div className={styles.row}>
            <span className={styles.rowMain}>
              <span className={styles.rowLabel}>{t("region")}</span>
              <span className={styles.rowHint}>{t("regionHint")}</span>
            </span>
          </div>
          <div className={styles.inputRow}>
            <input
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              maxLength={2}
              aria-label={t("region")}
              placeholder={t("regionPlaceholder")}
              className={styles.input}
              data-testid={TESTID.regionInput}
            />
            <button
              type={UI.button}
              onClick={saveRegion}
              disabled={busy}
              className={styles.primaryBtn}
              data-testid={TESTID.regionSave}
            >
              {busy ? t("saving") : t("save")}
            </button>
          </div>
          {showSuggestion && (
            <div className={styles.suggested} data-testid={TESTID.regionSuggested}>
              <span>{t("regionSuggested", { region: suggestedRegion })}</span>
              <button
                type={UI.button}
                onClick={useSuggestedRegion}
                disabled={busy}
                className={styles.secondaryBtn}
                data-testid={TESTID.regionUse}
              >
                {t("regionUse", { region: suggestedRegion })}
              </button>
            </div>
          )}
          <div className={styles.row}>
            <span className={styles.rowMain}>
              <span className={styles.rowLabel}>{t("emailToggle")}</span>
            </span>
            <button
              type={UI.button}
              role={UI.switch}
              aria-checked={emailOn ? UI.true : UI.false}
              aria-label={t("emailToggle")}
              onClick={toggleEmail}
              className={emailOn ? `${styles.toggle} ${styles.toggleOn}` : styles.toggle}
              data-testid={TESTID.emailToggle}
            >
              <span className={emailOn ? `${styles.knob} ${styles.knobOn}` : styles.knob} />
            </button>
          </div>
        </section>

        <section className={styles.group} aria-labelledby={SECTION.about}>
          <h2 className={styles.groupTitle} id={SECTION.about}>
            {t("about")}
          </h2>
          <Link href={ROUTES.privacy} className={styles.linkRow}>
            <span className={styles.rowMain}>{t("privacy")}</span>
            <span className={styles.chevron}>{UI.chevron}</span>
          </Link>
          <Link href={ROUTES.terms} className={styles.linkRow}>
            <span className={styles.rowMain}>{t("terms")}</span>
            <span className={styles.chevron}>{UI.chevron}</span>
          </Link>
          <Link href={ROUTES.credits} className={styles.linkRow} data-testid={TESTID.creditsLink}>
            <span className={styles.rowMain}>{t("credits")}</span>
            <span className={styles.chevron}>{UI.chevron}</span>
          </Link>
          <a href={ROUTES.help} className={styles.linkRow}>
            <span className={styles.rowMain}>{t("help")}</span>
            <span className={styles.chevron}>{UI.chevron}</span>
          </a>
        </section>

        <section className={styles.group} aria-labelledby={SECTION.session}>
          <h2 className={styles.groupTitle} id={SECTION.session}>
            {t("session")}
          </h2>
          <div className={styles.row}>
            <span className={styles.rowMain}>
              <span className={styles.rowLabel}>{t("signOutHint")}</span>
            </span>
            <button
              type={UI.button}
              onClick={signOut}
              disabled={busy}
              className={styles.secondaryBtn}
              data-testid={TESTID.signOut}
            >
              {t("signOut")}
            </button>
          </div>
        </section>

        {DELETE_ACCOUNT_ENABLED && (
          <section className={styles.group} aria-labelledby={SECTION.danger}>
            <h2 className={styles.groupTitle} id={SECTION.danger}>
              {t("dangerZone")}
            </h2>
            <div className={styles.row} data-testid={TESTID.deleteRow}>
              <span className={styles.rowMain}>
                <span className={styles.rowLabel}>{t("deleteAccount")}</span>
                <span className={styles.rowHint}>{t("deleteAccountHint")}</span>
              </span>
            </div>
          </section>
        )}

        <p className={styles.footer} data-testid={TESTID.version}>
          {t("version", { version })}
        </p>
      </main>
    </div>
  );
}

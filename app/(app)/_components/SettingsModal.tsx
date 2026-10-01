"use client";

/** User profile/settings modal (UX-SETTINGS-BTN-001): opened from the header
 *  gear button. Mirrors the /me controls — display name + language + theme +
 *  layout segs — using the same actions and the liked:prefs-synced
 *  useSyncExternalStore pattern (hydration-safe). */

import { useCallback, useState, useSyncExternalStore } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { SessionUser } from "@/app/lib/actions/session";
import { updateUsername } from "@/app/lib/actions/profile";
import { setLocaleAction } from "@/app/lib/actions/mvp2";
import { setTheme } from "./ThemeSync";
import { getLayoutPref, setLayoutPref } from "./prefs";
import Avatar from "./Avatar";
import Modal from "./Modal";
import { toast } from "@/lib/store/toastStore";
import { LOCALES } from "@/i18n/locales";

export default function SettingsModal({ user, open, onClose }: { user: SessionUser; open: boolean; onClose: () => void }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [name, setName] = useState(user.display_name ?? "");

  const subscribePrefs = useCallback((onChange: () => void) => {
    window.addEventListener("liked:prefs", onChange);
    return () => window.removeEventListener("liked:prefs", onChange);
  }, []);
  const theme = useSyncExternalStore(subscribePrefs, () => (localStorage.getItem("liked.theme") === "dark" ? "dark" : "light"), () => "light");
  const layout = useSyncExternalStore(subscribePrefs, getLayoutPref, () => "friends-left");

  const saveName = async () => {
    const res = await updateUsername(name.trim());
    if (res.ok) toast.success(t("me.saved")); else toast.error(res.error);
  };

  const changeLocale = async (l: string) => {
    await setLocaleAction(l);
    router.refresh();
  };

  const signOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <Modal open={open} onClose={onClose} title={t("nav.settings")}>
      <div className="settings-modal">
        <div className="settings-profile">
          <Avatar userId={user.id} avatarKey={user.avatar_key} name={user.display_name ?? ""} size={40} />
          <div className="row settings-name">
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn" onClick={saveName}>{t("common.save")}</button>
          </div>
        </div>
        <label className="fld">
          <span>{t("me.language")}</span>
          <select value={locale} onChange={(e) => changeLocale(e.target.value)}>
            {LOCALES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
          </select>
        </label>
        <label className="fld">
          <span>{t("me.theme")}</span>
          <div className="seg">
            {(["light", "dark"] as const).map((v) => (
              <button
                key={v}
                className={`seg-btn ${theme === v ? "seg-on" : ""}`}
                onClick={() => { setTheme(v); window.dispatchEvent(new Event("liked:prefs")); }}
              >
                {v === "light" ? t("me.themeLight") : t("me.themeDark")}
              </button>
            ))}
          </div>
        </label>
        <label className="fld">
          <span>{t("me.layout")}</span>
          <div className="seg">
            {(["friends-left", "friends-top"] as const).map((v) => (
              <button
                key={v}
                className={`seg-btn ${layout === v ? "seg-on" : ""}`}
                onClick={() => setLayoutPref(v)}
              >
                {v === "friends-left" ? t("me.layoutFriendsLeft") : t("me.layoutFriendsTop")}
              </button>
            ))}
          </div>
        </label>
        <div className="settings-actions">
          <Link href="/me" className="btn" onClick={onClose}>{t("nav.me")}</Link>
          <button className="btn btn-danger" onClick={signOut}>{t("nav.signOut")}</button>
        </div>
      </div>
    </Modal>
  );
}

"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import type { SessionUser } from "@/app/lib/actions/session";
import { updateUsername } from "@/app/lib/actions/profile";
import { setLocaleAction } from "@/app/lib/actions/mvp2";
import { setTheme } from "../../_components/ThemeSync";
import Avatar from "../../_components/Avatar";
import Crumbs from "../../_components/Crumbs";
import { toast } from "@/lib/store/toastStore";
import { LOCALES } from "@/i18n/locales";

export default function MeView({ user }: { user: SessionUser }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [name, setName] = useState(user.display_name ?? "");
  const [theme, setThemeState] = useState<"light" | "dark">(
    typeof window !== "undefined" && localStorage.getItem("liked.theme") === "dark" ? "dark" : "light"
  );

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
    <div className="me-view">
      <Crumbs items={[{ href: "/feed", label: t("nav.home") }, { label: t("nav.me") }]} />
      <h1 className="sec-title">{t("me.title")}</h1>

      <section className="me-card">
        <Avatar userId={user.id} avatarKey={user.avatar_key} name={user.display_name ?? ""} size={64} />
        <label className="fld">
          <span>{t("me.displayName")}</span>
          <div className="row">
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn" onClick={saveName}>{t("common.save")}</button>
          </div>
        </label>
      </section>

      <section className="me-card">
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
                onClick={() => { setThemeState(v); setTheme(v); }}
              >
                {v === "light" ? t("me.themeLight") : t("me.themeDark")}
              </button>
            ))}
          </div>
        </label>
      </section>

      <section className="me-card">
        <a className="btn" href="/friends">{t("nav.friends")}</a>
        <a className="btn" href="/youtube">{t("nav.youtube")}</a>
        <a className="btn" href="/extension/install">{t("nav.extension")}</a>
        <a className="btn" href="/trash">{t("nav.trash")}</a>
        <button className="btn btn-danger" onClick={signOut}>{t("nav.signOut")}</button>
      </section>
    </div>
  );
}

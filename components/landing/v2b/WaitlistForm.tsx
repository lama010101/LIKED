"use client";

import { useId, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CONTACT_EMAIL, LEGAL_LINKS, WAITLIST_NOTICE_VERSION } from "./config";
import { Icon } from "./icons";

// Waitlist form (UI only; storage is a later task). A real <form
// method="post" action="/api/waitlist"> that works without JS, enhanced with
// fetch + aria-live status when JS is available. Used in the hero and in the
// final CTA. `enabled` comes from the server (WAITLIST_ENABLED gating).
type Status = "idle" | "submitting" | "success" | "invalid" | "error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function WaitlistForm({ enabled }: { enabled: boolean }) {
  const t = useTranslations("landing.v2b");
  const locale = useLocale();
  const uid = useId();
  const [status, setStatus] = useState<Status>("idle");
  const inputId = `${uid}-email`;
  const noticeId = `${uid}-notice`;
  const statusId = `${uid}-status`;

  if (!enabled) {
    return (
      <p className="lb-wl-closed" data-testid="waitlist-closed">
        <Icon name="mail" size={18} />
        <span>{t("form.closed")}</span>
      </p>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    const form = e.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    // Enhanced path only: without JS the browser posts the form natively.
    e.preventDefault();
    if (!EMAIL_RE.test(email)) {
      setStatus("invalid");
      return;
    }
    setStatus("submitting");
    try {
      const body = new URLSearchParams();
      data.forEach((v, k) => { if (typeof v === "string") body.append(k, v); });
      const res = await fetch(form.action, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (res.ok) setStatus("success");
      else if (res.status === 400) setStatus("invalid");
      else setStatus("error");
    } catch {
      setStatus("error");
    }
  }

  const done = status === "success";
  const message =
    status === "success" ? t("form.success")
    : status === "invalid" ? t("form.invalid")
    : status === "error" ? t("form.error")
    : "";
  const bad = status === "invalid" || status === "error";

  return (
    <form
      className="lb-wl" method="post" action="/api/waitlist" noValidate
      onSubmit={onSubmit} data-status={status}
    >
      {!done && (
        <>
          <label htmlFor={inputId} className="lb-wl-label">{t("form.label")}</label>
          <div className="lb-wl-row">
            <input
              id={inputId} name="email" type="email" inputMode="email" autoComplete="email"
              required placeholder={t("form.placeholder")} className="lb-input"
              aria-invalid={status === "invalid" ? true : undefined}
              aria-describedby={`${noticeId}${message ? ` ${statusId}` : ""}`}
              onChange={() => status === "invalid" && setStatus("idle")}
            />
            <button type="submit" className="lb-btn" disabled={status === "submitting"}>
              {status === "submitting" ? t("form.submitting") : t("form.submit")}
            </button>
          </div>
          {/* honeypot: must stay empty; off-screen, not focusable, hidden from AT */}
          <div className="lb-hp" aria-hidden="true">
            <input type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </div>
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="notice_version" value={WAITLIST_NOTICE_VERSION} />
        </>
      )}
      <div id={statusId} className="lb-wl-status" role="status" aria-live="polite" data-tone={done ? "ok" : bad ? "bad" : undefined}>
        {message && (
          <>
            <Icon name={done ? "check" : "mail"} size={18} />
            <span>{message}</span>
          </>
        )}
      </div>
      <p id={noticeId} className="lb-wl-notice">
        {t.rich("form.notice", {
          email: CONTACT_EMAIL,
          mail: (chunks) => <a href={`mailto:${CONTACT_EMAIL}`}>{chunks}</a>,
        })}{" "}
        <a href={LEGAL_LINKS.privacy}>{t("form.privacy")}</a>
      </p>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

export default function DeletePanel() {
  const t = useTranslations("deletion");
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startReauth() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/reauth/start", { method: "GET" });
      const data = (await res.json()) as { authorizeUrl?: string; error?: string };
      if (res.ok && data.authorizeUrl) {
        window.location.href = data.authorizeUrl;
        return;
      }
      setError(data.error ?? "error");
    } catch {
      setError("error");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      });
      if (res.redirected) {
        window.location.href = res.url;
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.status === 401 && data.error === "REAUTH_REQUIRED") {
        await startReauth();
        return;
      }
      setError(data.error ?? "error");
    } catch {
      setError("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        {t("confirmCheckbox")}
      </label>
      <div>
        <button
          type="button"
          disabled={!checked || busy}
          onClick={deleteAccount}
        >
          {t("deleteButton")}
        </button>
        <button type="button" disabled={busy} onClick={startReauth}>
          {t("reauthButton")}
        </button>
      </div>
      {error ? <p role="alert">{t("errorGeneric")}</p> : null}
    </div>
  );
}

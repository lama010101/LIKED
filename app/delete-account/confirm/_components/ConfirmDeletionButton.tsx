"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const BUTTON_TYPE = "button";
const ROLE_STATUS = "status";
const ROLE_ALERT = "alert";

type ConfirmState = "idle" | "busy" | "confirmed" | "invalid" | "error";

export default function ConfirmDeletionButton({ token }: { token: string }) {
  const t = useTranslations("deletion");
  const [state, setState] = useState<ConfirmState>("idle");

  async function confirm() {
    if (state === "busy" || state === "confirmed") return;
    setState("busy");
    try {
      const res = await fetch("/api/delete-requests/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json().catch(() => null)) as { status?: unknown } | null;
      if (res.ok && body?.status === "confirmed") setState("confirmed");
      else if (res.ok) setState("invalid");
      else setState("error");
    } catch {
      setState("error");
    }
  }

  return (
    <section>
      <button type={BUTTON_TYPE} onClick={confirm} disabled={state === "busy" || state === "confirmed"}>
        {state === "busy" ? t("confirmBusy") : t("confirmButton")}
      </button>
      {state === "confirmed" ? <p role={ROLE_STATUS}>{t("pubStatusConfirmed")}</p> : null}
      {state === "invalid" ? <p role={ROLE_STATUS}>{t("pubStatusInvalid")}</p> : null}
      {state === "error" ? <p role={ROLE_ALERT}>{t("errorGeneric")}</p> : null}
    </section>
  );
}

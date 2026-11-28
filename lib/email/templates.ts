// Transactional email templates (P0-18). Plain strings per kind ×
// locale — REPO-17 covers only the v2 UI dirs, so lib/email is exempt.
// Locales are the app languages en/fr/es/th; the claimed row's
// `language` selects one, anything unrecognized falls back to English.
// Payload keys are read defensively: the outbox payloads are owned by
// the SQL enqueue paths, so a missing key degrades to a generic line.

export type EmailLocale = "en" | "fr" | "es" | "th";
export type EmailKind =
  | "recommendation_received"
  | "account_deleted"
  | "deletion_request_confirm";

export interface RenderedEmail {
  subject: string;
  text: string;
}

function localeOf(language: string | null | undefined): EmailLocale {
  const l = (language ?? "").toLowerCase();
  if (l.startsWith("fr")) return "fr";
  if (l.startsWith("es")) return "es";
  if (l.startsWith("th")) return "th";
  return "en";
}

function str(v: unknown): string {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : "";
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

const SUBJECTS: Record<EmailKind, Record<EmailLocale, string>> = {
  recommendation_received: {
    en: "New recommendations for you",
    fr: "Nouvelles recommandations pour vous",
    es: "Nuevas recomendaciones para ti",
    th: "มีคำแนะนำใหม่สำหรับคุณ",
  },
  account_deleted: {
    en: "Your LIKED account was deleted",
    fr: "Votre compte LIKED a été supprimé",
    es: "Tu cuenta de LIKED ha sido eliminada",
    th: "บัญชี LIKED ของคุณถูกลบแล้ว",
  },
  deletion_request_confirm: {
    en: "Confirm your account deletion request",
    fr: "Confirmez votre demande de suppression de compte",
    es: "Confirma tu solicitud de eliminación de cuenta",
    th: "ยืนยันคำขอลบบัญชีของคุณ",
  },
};

function recommendationText(
  loc: EmailLocale,
  payload: Record<string, unknown>
): string {
  const name = str(payload.contributor_name) || str(payload.contributor);
  const count = num(payload.count) ?? num(payload.recommendation_count);
  const who =
    loc === "fr"
      ? name || "Un ami"
      : loc === "es"
        ? name || "Un amigo"
        : loc === "th"
          ? name || "เพื่อนของคุณ"
          : name || "A friend";
  const n =
    count != null && count > 1
      ? loc === "fr"
        ? `${count} titres`
        : loc === "es"
          ? `${count} títulos`
          : loc === "th"
            ? `${count} รายการ`
            : `${count} titles`
      : loc === "fr"
        ? "un titre"
        : loc === "es"
          ? "un título"
          : loc === "th"
            ? "1 รายการ"
            : "a title";
  switch (loc) {
    case "fr":
      return `${who} vous a recommandé ${n}. Ouvrez LIKED pour les découvrir.`;
    case "es":
      return `${who} te recomendó ${n}. Abre LIKED para verlas.`;
    case "th":
      return `${who} แนะนำ ${n} ให้คุณ เปิด LIKED เพื่อดู`;
    default:
      return `${who} recommended ${n} to you. Open LIKED to see them.`;
  }
}

function accountDeletedText(loc: EmailLocale): string {
  switch (loc) {
    case "fr":
      return "Votre compte LIKED et toutes les données associées ont été définitivement supprimés. Si vous n'êtes pas à l'origine de cette action, contactez le support.";
    case "es":
      return "Tu cuenta de LIKED y todos los datos asociados se han eliminado de forma permanente. Si no solicitaste esto, contacta con soporte.";
    case "th":
      return "บัญชี LIKED และข้อมูลที่เกี่ยวข้องทั้งหมดของคุณถูกลบอย่างถาวรแล้ว หากคุณไม่ได้เป็นผู้ดำเนินการนี้ โปรดติดต่อฝ่ายสนับสนุน";
    default:
      return "Your LIKED account and all associated data have been permanently deleted. If you did not request this, please contact support.";
  }
}

function deletionConfirmText(
  loc: EmailLocale,
  payload: Record<string, unknown>
): string {
  const url =
    str(payload.confirm_url) ||
    str(payload.url) ||
    str(payload.link) ||
    str(payload.token_url);
  const linkLine = url ? `\n\n${url}` : "";
  switch (loc) {
    case "fr":
      return `Une demande de suppression de compte a été faite pour cette adresse. Confirmez-la en ouvrant ce lien (valable 7 jours) :${linkLine}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message — rien ne sera supprimé.`;
    case "es":
      return `Se ha solicitado la eliminación de la cuenta para esta dirección. Confírmala abriendo este enlace (válido 7 días):${linkLine}\n\nSi no solicitaste esto, ignora este mensaje: no se eliminará nada.`;
    case "th":
      return `มีคำขอลบบัญชีสำหรับที่อยู่อีเมลนี้ ยืนยันโดยเปิดลิงก์นี้ (ใช้ได้ 7 วัน):${linkLine}\n\nหากคุณไม่ได้เป็นผู้ส่งคำขอนี้ ไม่ต้องดำเนินการใดๆ — จะไม่มีการลบข้อมูล`;
    default:
      return `An account deletion request was made for this address. Confirm it by opening this link (valid 7 days):${linkLine}\n\nIf you did not make this request, ignore this message — nothing will be deleted.`;
  }
}

/** Render subject + plain-text body for one outbox kind. Returns null
 *  for an unknown kind so the drain can finish it as an error. */
export function renderEmail(
  kind: string,
  language: string | null | undefined,
  payload: Record<string, unknown>
): RenderedEmail | null {
  if (
    kind !== "recommendation_received" &&
    kind !== "account_deleted" &&
    kind !== "deletion_request_confirm"
  ) {
    return null;
  }
  const loc = localeOf(language);
  const k = kind as EmailKind;
  const text =
    k === "recommendation_received"
      ? recommendationText(loc, payload)
      : k === "account_deleted"
        ? accountDeletedText(loc)
        : deletionConfirmText(loc, payload);
  return { subject: SUBJECTS[k][loc], text };
}

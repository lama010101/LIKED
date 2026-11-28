"use client";

// Owner "Manage {name}" sheet (PRD §10.1, migration 155): two actions —
// Remove their recommendations / Block {name} — each behind a confirm step
// that states exactly what will happen. All logic lives in manage-utils;
// this component only renders the current step and dispatches events.

import { useEffect, useReducer, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  blockContributorAction,
  removeContributorAction,
} from "@/app/lib/actions/v2-owner";
import { CloseIcon } from "./icons";
import styles from "./inbox.module.css";
import { UI } from "./ui-constants";
import { MANAGE_MENU, manageStep, type ManageStep } from "./manage-utils";

const TITLE_ID = "manage-friend-title";

export default function ManageFriendSheet({
  contributorId,
  displayName,
  onClose,
  onDone,
}: {
  contributorId: string;
  displayName: string;
  onClose: () => void;
  /** Fired after a successful remove/block so the parent can refresh. */
  onDone: () => void;
}) {
  const t = useTranslations("friends.manage");
  const closeRef = useRef<HTMLButtonElement>(null);
  const [step, dispatch] = useReducer(
    (s: ManageStep | null, event: Parameters<typeof manageStep>[1]): ManageStep | null =>
      s === null ? s : manageStep(s, event),
    MANAGE_MENU as ManageStep | null
  );

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  useEffect(() => {
    if (step === null) onDone();
  }, [step, onDone]);

  if (step === null) return null;

  const confirmCopy =
    step.name !== "menu"
      ? step.action === "remove"
        ? t("confirmRemove", { name: displayName })
        : t("confirmBlock", { name: displayName })
      : "";

  const runConfirm = async (action: "remove" | "block") => {
    dispatch({ type: "confirm" });
    try {
      if (action === "remove") await removeContributorAction(contributorId);
      else await blockContributorAction(contributorId);
      dispatch({ type: "success" });
    } catch (e) {
      dispatch({ type: "fail", message: e instanceof Error ? e.message : "error" });
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose} data-testid="manage-friend-overlay">
      <section
        role={UI.dialog}
        aria-modal={UI.true}
        aria-labelledby={TITLE_ID}
        className={styles.sheet}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.sheetHeader}>
          <div>
            <h2 id={TITLE_ID} className={styles.sheetTitle}>
              {t("title", { name: displayName })}
            </h2>
          </div>
          <button
            ref={closeRef}
            type={UI.button}
            onClick={onClose}
            aria-label={t("close")}
            className={styles.closeBtn}
          >
            <CloseIcon />
          </button>
        </div>

        {step.name === "menu" && (
          <div className={styles.section} data-testid="manage-friend-menu">
            <button
              type={UI.button}
              onClick={() => dispatch({ type: "choose", action: "remove" })}
              data-testid="manage-choose-remove"
              className={styles.trailerBtn}
            >
              {t("removeAction")}
            </button>
            <button
              type={UI.button}
              onClick={() => dispatch({ type: "choose", action: "block" })}
              data-testid="manage-choose-block"
              className={styles.trailerBtn}
            >
              {t("blockAction", { name: displayName })}
            </button>
          </div>
        )}

        {(step.name === "confirm" || step.name === "busy" || step.name === "error") && (
          <div className={styles.section} data-testid="manage-friend-confirm">
            <p className={styles.overview}>{confirmCopy}</p>
            {step.name === "error" && (
              <p role="alert" data-testid="manage-friend-error">
                {t("failed")}
              </p>
            )}
            <div>
              <button
                type={UI.button}
                onClick={() => void runConfirm(step.action)}
                disabled={step.name === "busy"}
                data-testid="manage-confirm-yes"
                className={styles.trailerBtn}
              >
                {step.name === "busy" ? t("working") : t("confirmYes")}
              </button>
              <button
                type={UI.button}
                onClick={() => dispatch({ type: "back" })}
                disabled={step.name === "busy"}
                data-testid="manage-confirm-back"
                className={styles.trailerBtn}
              >
                {t("confirmBack")}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

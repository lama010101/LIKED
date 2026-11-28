"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  getGenreCatalogAction,
  regenerateMyAskAction,
  setAskActiveAction,
  updateAskSettingsAction,
  type GenreOption,
} from "@/app/lib/actions/v2-owner";
import { toast } from "@/lib/store/toastStore";
import { CloseIcon, CopyIcon, ShareIcon } from "./icons";
import styles from "./inbox.module.css";
import { TESTID, UI } from "./ui-constants";
import { buildAskUrl, type AskRow } from "./inbox-utils";

const TITLE_ID = "inbox-share-title";

/** Share bar (PRD §6.1): copy the Ask link, native share, regenerate (the old
 *  token stops resolving immediately) and disable/enable. */
export default function ShareBar({
  ask,
  onAskChange,
  onClose,
}: {
  ask: AskRow;
  onAskChange: (ask: AskRow) => void;
  onClose: () => void;
}) {
  const t = useTranslations("inbox");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(ask.note ?? "");
  const [selectedGenres, setSelectedGenres] = useState<number[]>(ask.liked_genres ?? []);
  const [catalog, setCatalog] = useState<GenreOption[]>([]);
  const link = typeof window === "undefined" ? "" : buildAskUrl(window.location.origin, ask.token);

  useEffect(() => {
    let live = true;
    getGenreCatalogAction()
      .then((rows) => {
        if (live) setCatalog(rows);
      })
      .catch(() => {
        if (live) setCatalog([]);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t("copied"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    }
  };

  const share = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: t("shareTitle"), url: link });
        return;
      } catch {
        // user dismissed the native sheet — fall through to copy
      }
    }
    await copy();
  };

  const regenerate = async () => {
    if (!window.confirm(t("regenerateConfirm"))) return;
    setBusy(true);
    try {
      const token = await regenerateMyAskAction();
      onAskChange({ ...ask, token, is_active: true });
      toast.success(t("regenerateDone"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };


  const toggleGenre = (id: number) => {
    setSelectedGenres((current) =>
      current.includes(id)
        ? current.filter((genre) => genre !== id)
        : current.length < 5
          ? [...current, id]
          : current
    );
  };

  const saveSettings = async () => {
    setBusy(true);
    try {
      const nextNote = note.trim() ? note.trim() : null;
      await updateAskSettingsAction({
        prompt: ask.prompt,
        note: nextNote,
        likedGenres: selectedGenres,
      });
      onAskChange({ ...ask, note: nextNote, liked_genres: selectedGenres });
      toast.success(t("askSettingsSaved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async () => {
    setBusy(true);
    try {
      const next = !ask.is_active;
      await setAskActiveAction(next);
      onAskChange({ ...ask, is_active: next });
      toast.success(next ? t("linkEnabled") : t("linkDisabled"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose} data-testid={TESTID.shareBar}>
      <div
        role={UI.dialog}
        aria-modal={UI.true}
        aria-labelledby={TITLE_ID}
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.modalHeader}>
          <h2 id={TITLE_ID} className={styles.modalTitle}>
            {t("shareTitle")}
          </h2>
          <button
            type={UI.button}
            onClick={onClose}
            aria-label={t("close")}
            className={styles.closeBtn}
          >
            <CloseIcon />
          </button>
        </div>
        <p className={styles.hint}>{t("shareHint")}</p>

        <input
          readOnly
          value={link}
          aria-label={t("shareTitle")}
          data-testid={TESTID.shareUrl}
          className={styles.urlInput}
        />

        <div className={styles.actions}>
          <button type={UI.button} onClick={copy} className={styles.primaryBtn}>
            <CopyIcon />
            {t("copy")}
          </button>
          <button type={UI.button} onClick={share} className={styles.secondaryBtn}>
            <ShareIcon />
            {t("share")}
          </button>
        </div>


        <div className={styles.askSettings} data-testid="ask-settings">
          <label className={styles.fieldLabel} htmlFor="ask-owner-note">
            {t("noteLabel")}
          </label>
          <textarea
            id="ask-owner-note"
            value={note}
            maxLength={140}
            rows={2}
            onChange={(event) => setNote(event.target.value)}
            className={styles.noteInput}
            data-testid="ask-note-input"
          />
          <p className={styles.hint}>{t("noteHint")}</p>

          <span className={styles.fieldLabel}>{t("genresLabel")}</span>
          <div className={styles.genreGrid} data-testid="ask-genre-picker">
            {catalog.map((genre) => {
              const selected = selectedGenres.includes(genre.id);
              const blocked = !selected && selectedGenres.length >= 5;
              return (
                <button
                  key={genre.id}
                  type={UI.button}
                  aria-pressed={selected}
                  disabled={busy || blocked}
                  onClick={() => toggleGenre(genre.id)}
                  className={selected ? styles.genreSelected : styles.genreOption}
                  data-testid="ask-genre-option"
                  data-genre-id={genre.id}
                >
                  {genre.name}
                </button>
              );
            })}
          </div>
          <p className={styles.hint}>{t("genresHint", { count: selectedGenres.length })}</p>
          <button
            type={UI.button}
            disabled={busy}
            onClick={saveSettings}
            className={styles.primaryBtn}
            data-testid="ask-settings-save"
          >
            {t("saveAskSettings")}
          </button>
        </div>

        <div className={styles.divider}>
          <button
            type={UI.button}
            disabled={busy}
            onClick={regenerate}
            className={styles.smallBtn}
          >
            {t("regenerate")}
          </button>
          <button
            type={UI.button}
            disabled={busy}
            onClick={toggleActive}
            data-testid={TESTID.shareToggle}
            className={styles.smallBtn}
          >
            {ask.is_active ? t("disable") : t("enable")}
          </button>
          <span className={styles.stateText} data-testid={TESTID.shareState}>
            {ask.is_active ? t("linkEnabled") : t("linkDisabled")}
          </span>
        </div>
      </div>
    </div>
  );
}

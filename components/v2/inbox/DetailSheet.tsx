"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import {
  getInboxItemAction,
  getInboxLibraryTargetAction,
  getPromoteFolderChoicesAction,
  promoteRecommendationAction,
  listMyPicksAction,
  setPickVisibilityAction,
  type InboxLibraryTarget,
  type PromoteFolderChoices,
} from "@/app/lib/actions/v2-owner";
import { createFolderAction } from "@/app/lib/actions/mvp2";
import { toast } from "@/lib/store/toastStore";
import ScoreRing from "./ScoreRing";
import { CloseIcon, PlayIcon } from "./icons";
import styles from "./inbox.module.css";
import { TESTID, TONE, UI } from "./ui-constants";
import {
  cardImageUrl,
  displayableGenres,
  formatPercent,
  formatRecommenderDate,
  isSkeleton,
  languageName,
  splitRuntime,
  typeKey,
  type InboxCard,
  type InboxItemDetail,
} from "./inbox-utils";

const TITLE_ID = "inbox-detail-title";

/** Item detail sheet (PRD §6.2): overview, runtime, original language, genres,
 *  two SEPARATE rings (Friends accent / TMDB neutral — never blended), trailer,
 *  and one row per recommending friend returned by get_inbox_item. */
export default function DetailSheet({
  card,
  onClose,
}: {
  card: InboxCard;
  onClose: () => void;
}) {
  const t = useTranslations("inbox");
  const locale = useLocale();
  const closeRef = useRef<HTMLButtonElement>(null);
  const title = card.title || card.original_title || t("untitled");
  const image = cardImageUrl(card);
  const runtime = splitRuntime(card.runtime_min);
  const genres = displayableGenres(card.genres);
  const language = languageName(card.original_language, locale);
  const skeleton = isSkeleton(card);
  const friendsLabel =
    card.rater_count > 0
      ? `${t("friendsAverage")} ${t("raters", { count: card.rater_count })}`
      : t("friendsAverage");
  const [detail, setDetail] = useState<InboxItemDetail | null>(null);
  const router = useRouter();
  const tLibrary = useTranslations("library");
  const tPicks = useTranslations("picks");
  const [target, setTarget] = useState<InboxLibraryTarget | null>(null);
  const [libraryNode, setLibraryNode] = useState<string | null>(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [folderChoices, setFolderChoices] = useState<PromoteFolderChoices | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [promoteBusy, setPromoteBusy] = useState(false);
  const [promoteDone, setPromoteDone] = useState<{ nodeId: string; folder: string } | null>(null);
  const [pickTier, setPickTier] = useState<"private" | "contributors">("private");
  const refreshPickTier = async (nodeId: string | null) => {
    if (!nodeId) return;
    try {
      const picks = await listMyPicksAction();
      setPickTier(picks.some((p) => p.node_id === nodeId) ? "contributors" : "private");
    } catch {}
  };
  const canPromote = ["movie", "series", "video", "playlist"].includes(card.kind);
  const inLibrary = card.in_library || libraryNode !== null;

  useEffect(() => {
    let active = true;
    getInboxItemAction(card.item_id)
      .then((value) => {
        if (active) setDetail(value);
      })
      .catch(() => {
        if (active) setDetail(null);
      });
    getInboxLibraryTargetAction(card.item_id)
      .then((value) => {
        if (!active) return;
        setTarget(value);
        setLibraryNode(value?.library_node_id ?? null);
        void refreshPickTier(value?.library_node_id ?? null);
      })
      .catch(() => {
        if (active) setTarget(null);
      });
    return () => {
      active = false;
    };
  }, [card.item_id]);

  const openPromote = async () => {
    setPromoteOpen(true);
    setPromoteDone(null);
    if (!folderChoices) {
      try {
        const choices = await getPromoteFolderChoicesAction();
        setFolderChoices(choices);
        setSelectedFolder((current) => current ?? choices.last_used_folder_id);
      } catch {
        setFolderChoices({ last_used_folder_id: null, folders: [] });
      }
    }
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name || promoteBusy) return;
    setPromoteBusy(true);
    try {
      const id = await createFolderAction({ name, parentId: null });
      const choices = await getPromoteFolderChoicesAction();
      setFolderChoices(choices);
      setSelectedFolder(id);
      setNewFolderName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tLibrary("error"));
    } finally {
      setPromoteBusy(false);
    }
  };

  const setPick = async (visibility: "private" | "contributors") => {
    if (!libraryNode || promoteBusy) return;
    setPromoteBusy(true);
    try {
      await setPickVisibilityAction(libraryNode, visibility);
      setPickTier(visibility);
    } catch {
      toast.error(tLibrary("error"));
    } finally {
      setPromoteBusy(false);
    }
  };

  const promote = async () => {
    if (!target?.recommendation_id || promoteBusy) return;
    setPromoteBusy(true);
    try {
      const result = await promoteRecommendationAction(target.recommendation_id, selectedFolder);
      setLibraryNode(result.node_id);
      void refreshPickTier(result.node_id);
      const folder = selectedFolder
        ? folderChoices?.folders.find((f) => f.id === selectedFolder)?.name ?? tLibrary("defaultFolder")
        : tLibrary("defaultFolder");
      setPromoteDone({ nodeId: result.node_id, folder });
      setPromoteOpen(false);
      if (result.already) toast.info(tLibrary("alreadyInLibrary"));
      else toast.success(tLibrary("addedTo", { folder }));
    } catch (e) {
      toast.error(e instanceof Error && e.message.includes("UNSUPPORTED_KIND") ? tLibrary("unsupported") : tLibrary("error"));
    } finally {
      setPromoteBusy(false);
    }
  };

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

  return (
    <div className={styles.overlay} onClick={onClose} data-testid={TESTID.detailOverlay}>
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
              {title}
            </h2>
            <div className={styles.sheetMeta}>
              {card.year !== null && <span>{card.year}</span>}
              <span className={styles.chip}>{t(typeKey(card.type))}</span>
              {runtime && (
                <span>
                  {runtime.hours > 0
                    ? t("runtimeHm", { hours: runtime.hours, minutes: runtime.minutes })
                    : t("runtimeValue", { minutes: runtime.minutes })}
                </span>
              )}
            </div>
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

        <div className={styles.hero}>
          <div className={styles.posterLarge}>
            {image ? (
              // eslint-disable-next-line @next/next/no-img-element -- TMDB hotlink, CSP owns the allowlist
              <img src={image} alt={UI.empty} className={styles.posterImg} />
            ) : (
              <div className={skeleton ? `${styles.posterImg} ${styles.pulse}` : styles.posterImg} />
            )}
          </div>
          <div className={styles.ringsRow}>
            <div className={styles.ringBlock} data-testid={TESTID.ringFriends}>
              <div className={styles.ringValueWrap}>
                <ScoreRing
                  percent={card.friends_avg}
                  tone={TONE.friends}
                  size={56}
                  label={
                    card.friends_avg === null
                      ? t("noFriendsScore")
                      : t("friendsRingLabel", { score: card.friends_avg, count: card.rater_count })
                  }
                />
                {card.friends_avg !== null && (
                  <span className={styles.ringValue}>{formatPercent(card.friends_avg)}</span>
                )}
              </div>
              <span className={styles.ringLabel}>{friendsLabel}</span>
            </div>
            <div className={styles.ringBlock} data-testid={TESTID.ringTmdb}>
              <div className={styles.ringValueWrap}>
                <ScoreRing
                  percent={card.tmdb_score}
                  tone={TONE.tmdb}
                  size={56}
                  label={
                    card.tmdb_score === null
                      ? t("noTmdbScore")
                      : t("tmdbRingLabel", { score: card.tmdb_score })
                  }
                />
                {card.tmdb_score !== null && (
                  <span className={styles.ringValue}>{formatPercent(card.tmdb_score)}</span>
                )}
              </div>
              <span className={styles.ringLabel}>{t("tmdbScore")}</span>
            </div>
          </div>
        </div>

        {card.overview && (
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>{t("overview")}</h3>
            <p className={styles.overview}>{card.overview}</p>
          </section>
        )}

        {(language || genres.length > 0) && (
          <section className={styles.section}>
            {language && (
              <p className={styles.metaLine}>{t("languageLine", { value: language })}</p>
            )}
            {genres.length > 0 && (
              <p className={styles.metaLine}>{t("genresLine", { value: genres.join(", ") })}</p>
            )}
          </section>
        )}

        {canPromote && (
          <div className={styles.libraryActions} data-testid="library-actions">
            {inLibrary ? (
              <button
                type={UI.button}
                className={styles.secondaryBtn}
                onClick={() => libraryNode && router.push(`/card/${libraryNode}`)}
                disabled={!libraryNode}
              >
                {tLibrary("inLibrary")}
              </button>
            ) : (
              <button
                type={UI.button}
                className={styles.primaryBtn}
                onClick={openPromote}
                disabled={!target?.recommendation_id}
                data-testid="promote-open"
              >
                {tLibrary("addToLibrary")}
              </button>
            )}
            {promoteDone && (
              <button
                type={UI.button}
                className={styles.smallBtn}
                onClick={() => router.push(`/card/${promoteDone.nodeId}`)}
                data-testid="promote-open-card"
              >
                {tLibrary("open")}
              </button>
            )}
          </div>
        )}

        {inLibrary && libraryNode && (
          <div className={styles.libraryActions} data-testid="pick-control">
            <span className={styles.sheetMeta}>{tPicks("myPick")}</span>
            <button
              type={UI.button}
              className={pickTier === "private" ? styles.primaryBtn : styles.secondaryBtn}
              disabled={promoteBusy}
              onClick={() => setPick("private")}
            >
              {tPicks("private")}
            </button>
            <button
              type={UI.button}
              className={pickTier === "contributors" ? styles.primaryBtn : styles.secondaryBtn}
              disabled={promoteBusy}
              onClick={() => setPick("contributors")}
            >
              {tPicks("friendsWhoRecommend")}
            </button>
          </div>
        )}

        {card.trailer_url && (
          <a
            href={card.trailer_url}
            target={UI.blank}
            rel={UI.noopener}
            className={styles.trailerBtn}
          >
            <PlayIcon />
            {t("trailer")}
          </a>
        )}

        <section>
          <h3 className={styles.sectionTitle}>{t("recommendingFriends")}</h3>
          <ul className={styles.friendList}>
            {(detail?.recommenders ?? []).map((r, index) => (
              <li
                key={`${r.name}:${r.created_at}:${index}`}
                className={styles.friendRow}
                data-testid={TESTID.recommenderRow}
              >
                <span className={styles.friendAvatar}>{r.initials}</span>
                <span className={styles.friendBody}>
                  <span className={styles.friendHeader}>
                    <span className={styles.friendName}>{r.name}</span>
                    <span className={styles.friendScore}>
                      {r.rating !== null ? formatPercent(r.rating) : t("noScore")}
                    </span>
                  </span>
                  {r.platform_text && (
                    <span className={styles.friendPlatform}>{r.platform_text}</span>
                  )}
                  {r.comment && <span className={styles.friendComment}>{r.comment}</span>}
                  <time className={styles.friendDate} dateTime={r.created_at}>
                    {formatRecommenderDate(r.created_at, locale)}
                  </time>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </section>

      {promoteOpen && (
        <section
          className={styles.promoteSheet}
          aria-label={tLibrary("addToLibrary")}
          onClick={(e) => e.stopPropagation()}
          data-testid="promote-sheet"
        >
          <div className={styles.promoteHeader}>
            <div className={styles.promotePoster}>
              {image ? (
                // eslint-disable-next-line @next/next/no-img-element -- TMDB hotlink, CSP owns the allowlist
                <img src={image} alt={UI.empty} className={styles.posterImg} />
              ) : null}
            </div>
            <div>
              <h2 className={styles.sheetTitle}>{title}</h2>
              {card.year !== null && <div className={styles.sheetMeta}>{card.year}</div>}
            </div>
          </div>

          <button type={UI.button} className={styles.folderRow} onClick={() => setSelectedFolder(null)}>
            <span>{tLibrary("chooseFolder")}</span>
            <strong>{selectedFolder ? folderChoices?.folders.find((f) => f.id === selectedFolder)?.name : tLibrary("defaultFolder")}</strong>
          </button>
          <div className={styles.folderList}>
            {(folderChoices?.folders ?? []).map((folder) => (
              <button
                key={folder.id}
                type={UI.button}
                className={selectedFolder === folder.id ? `${styles.folderOption} ${styles.folderOptionSelected}` : styles.folderOption}
                style={{ paddingInlineStart: `${12 + (folder.depth - 1) * 16}px` }}
                onClick={() => setSelectedFolder(folder.id)}
              >
                {folder.name}
              </button>
            ))}
          </div>
          <div className={styles.newFolderRow}>
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder={tLibrary("folderNamePlaceholder")}
              aria-label={tLibrary("newFolder")}
              className={styles.newFolderInput}
            />
            <button type={UI.button} className={styles.smallBtn} disabled={promoteBusy || !newFolderName.trim()} onClick={createFolder}>
              {tLibrary("createFolder")}
            </button>
          </div>
          <div className={styles.actions}>
            <button type={UI.button} className={styles.primaryBtn} disabled={promoteBusy} onClick={promote} data-testid="promote-submit">
              {tLibrary("add")}
            </button>
            <button type={UI.button} className={styles.secondaryBtn} disabled={promoteBusy} onClick={() => setPromoteOpen(false)}>
              {tLibrary("cancel")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

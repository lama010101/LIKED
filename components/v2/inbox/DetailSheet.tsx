"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { getInboxItemAction } from "@/app/lib/actions/v2-owner";
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
  youtubePlaylistUrl,
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
  const tp = useTranslations("playlist");
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

  useEffect(() => {
    let active = true;
    getInboxItemAction(card.item_id)
      .then((value) => {
        if (active) setDetail(value);
      })
      .catch(() => {
        if (active) setDetail(null);
      });
    return () => {
      active = false;
    };
  }, [card.item_id]);

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
              <span className={styles.chip}>
                {typeKey(card.type, card.kind) === "typePlaylist"
                  ? tp("typeChip")
                  : t(typeKey(card.type, card.kind))}
              </span>
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

        {detail?.item.kind === "playlist" && youtubePlaylistUrl(detail.item.external_id) && (
          <a
            href={youtubePlaylistUrl(detail.item.external_id) as string}
            target={UI.blank}
            rel={UI.noopener}
            className={styles.trailerBtn}
            data-testid={TESTID.openPlaylist}
          >
            <PlayIcon />
            {tp("openOnYouTube")}
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
    </div>
  );
}

"use client";

import { useTranslations } from "next-intl";
import ScoreRing from "./ScoreRing";
import styles from "./inbox.module.css";
import { TESTID, TONE, UI } from "./ui-constants";
import {
  cardImageUrl,
  formatPercent,
  isSkeleton,
  typeKey,
  type InboxCard,
} from "./inbox-utils";

/** One merged inbox card (PRD §6.2): poster, title, year, type chip, up to 3
 *  recommender avatars + "+N", the friends' average ring with the rater count,
 *  up to 2 platform labels and the one-line quote. Skeleton fields render as
 *  placeholders; nothing missing is invented. */
export default function InboxCardView({
  card,
  onOpen,
}: {
  card: InboxCard;
  onOpen: (card: InboxCard) => void;
}) {
  const t = useTranslations("inbox");
  const title = card.title || card.original_title || t("untitled");
  const image = cardImageUrl(card);
  const skeleton = isSkeleton(card);
  const visible = card.recommenders.slice(0, 3);
  const platforms = card.platforms.slice(0, 2);
  const posterClass = skeleton ? `${styles.posterImg} ${styles.pulse}` : styles.posterImg;

  return (
    <article
      data-testid={TESTID.card}
      data-item-id={card.item_id}
      data-recommender-count={card.recommender_count}
      data-rater-count={card.rater_count}
      data-friends-avg={card.friends_avg ?? ""}
      data-tmdb-score={card.tmdb_score ?? ""}
      data-skeleton={skeleton ? "1" : "0"}
      className={styles.card}
    >
      <button
        type={UI.button}
        onClick={() => onOpen(card)}
        aria-label={t("openCard", { title })}
        className={styles.cardBtn}
      >
        <div className={styles.poster}>
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element -- TMDB hotlink, CSP owns the allowlist
            <img src={image} alt={UI.empty} className={styles.posterImg} />
          ) : (
            <div className={posterClass} />
          )}
        </div>

        <div className={styles.cardBody}>
          <div className={styles.titleRow}>
            <h3 className={styles.cardTitle}>{title}</h3>
            {card.year !== null && <span className={styles.year}>{card.year}</span>}
            <span className={styles.chip}>{t(typeKey(card.type))}</span>
          </div>

          <div className={styles.avatars} data-testid={TESTID.cardAvatars}>
            {visible.map((r) => (
              <span key={r.contributor_id} title={r.display_name} className={styles.avatar}>
                {r.initials}
              </span>
            ))}
            {card.more_count > 0 && (
              <span className={styles.moreCount}>
                {t("moreRecommenders", { count: card.more_count })}
              </span>
            )}
          </div>

          {card.quote && <p className={styles.quote}>{t("quoteLine", { quote: card.quote })}</p>}

          {platforms.length > 0 && (
            <div className={styles.platforms} data-testid={TESTID.cardPlatforms}>
              {platforms.map((p) => (
                <span key={p} className={styles.platform}>
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>

      <div className={styles.ringCol}>
        {card.rater_count > 0 && card.friends_avg !== null ? (
          <div className={styles.ringValueWrap}>
            <ScoreRing
              percent={card.friends_avg}
              tone={TONE.friends}
              label={t("friendsRingLabel", { score: card.friends_avg, count: card.rater_count })}
            />
            <span className={styles.ringValue}>{formatPercent(card.friends_avg)}</span>
          </div>
        ) : (
          <div className={styles.ringEmpty} aria-hidden />
        )}
        {card.rater_count > 0 && (
          <span className={styles.raters} data-testid={TESTID.cardRaters}>
            {t("raters", { count: card.rater_count })}
          </span>
        )}
      </div>
    </article>
  );
}

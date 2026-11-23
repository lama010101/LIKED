import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "./icons";

// Landing-local preview components (V2-LANDING-002-A). They are NOT the app's
// inbox components: they use static data and the shared v2 tokens only, so the
// landing cannot break when the inbox changes. No runtime TMDB / YouTube /
// Supabase calls; posters are neutral gradient placeholders.
// Everything here is decorative or wrapped by a role="img" / aria-hidden
// parent: no fake focusable controls.

export type Kind = "movie" | "series" | "video";
export type FriendKey = "alex" | "maya" | "jules";

const FRIEND_N: Record<FriendKey, number> = { alex: 1, maya: 2, jules: 3 };
const KIND_ICON = { movie: "film", series: "tv", video: "play" } as const;

export function Avatar({ who, size = 28 }: { who: FriendKey; size?: number }) {
  const t = useTranslations("landing.v2b.demo.friends");
  return (
    <span
      className="lb-av"
      style={{ "--s": `${size}px`, background: `var(--v2-lp-av-${FRIEND_N[who]})` } as CSSProperties}
    >
      {t(who).slice(0, 1)}
    </span>
  );
}

export function AvatarStack({ who, size = 24 }: { who: FriendKey[]; size?: number }) {
  return (
    <span className="lb-avstack">
      {who.map((w) => <Avatar key={w} who={w} size={size} />)}
    </span>
  );
}

/** Neutral gradient poster placeholder. Large ones carry the title on a scrim. */
export function Poster({ n, kind, title, large = false }: { n: number; kind: Kind; title?: string; large?: boolean }) {
  return (
    <span className="lb-poster" data-large={large ? "" : undefined} style={{ background: `var(--v2-lp-poster-${n})` }}>
      {large ? <span className="lb-poster-title">{title}</span> : <Icon name={KIND_ICON[kind]} size={18} className="lb-poster-glyph" />}
    </span>
  );
}

export function Ring({ pct, tone = "friends", size = 36 }: { pct: number; tone?: "friends" | "tmdb"; size?: number }) {
  return (
    <svg
      className="lb-ring" data-tone={tone} viewBox="0 0 36 36" width={size} height={size}
      style={{ "--pct": pct } as CSSProperties} aria-hidden="true" focusable="false"
    >
      <circle cx="18" cy="18" r="15" className="lb-ring-bg" />
      <circle cx="18" cy="18" r="15" pathLength={100} className="lb-ring-fg" transform="rotate(-90 18 18)" />
    </svg>
  );
}

export function TypeChip({ kind }: { kind: Kind }) {
  const t = useTranslations("landing.v2b.type");
  return (
    <span className="lb-chip">
      <Icon name={KIND_ICON[kind]} size={13} />
      {t(kind)}
    </span>
  );
}

export function ExampleTag() {
  const t = useTranslations("landing.v2b");
  return <span className="lb-tag">{t("example")}</span>;
}

/* ── Hero: inbox preview ─────────────────────────────────────────────── */
const INBOX_CARDS = [
  { id: "pastLives", year: 2023, kind: "movie", poster: 3, pct: 87, count: 3, who: ["alex", "maya", "jules"] },
  { id: "severance", year: 2022, kind: "series", poster: 2, pct: 91, count: 2, who: ["maya", "jules"] },
  { id: "pasta", year: 2024, kind: "video", poster: 4, pct: 78, count: 1, who: ["alex"] },
] as const;

export function InboxPreview() {
  const t = useTranslations("landing.v2b");
  const name = (k: FriendKey) => t(`demo.friends.${k}`);
  return (
    <figure className="lb-inbox" role="img" aria-label={t("hero.previewAlt")}>
      <div className="lb-inbox-top">
        <span className="lb-inbox-title"><Icon name="inbox" size={16} />{t("demo.inbox")}</span>
        <ExampleTag />
      </div>
      <div className="lb-rail">
        <span className="lb-rail-avs">
          {(["alex", "maya", "jules"] as const).map((k) => (
            <span className="lb-rail-av" key={k}>
              <Avatar who={k} size={34} />
              <span className="lb-dot" />
            </span>
          ))}
        </span>
        <span className="lb-rail-text">
          {t("demo.rail", { first: name("alex"), second: name("maya") })}
        </span>
        <span className="lb-unseen">{t("demo.unseen", { count: 3 })}</span>
      </div>
      <ul className="lb-cards">
        {INBOX_CARDS.map((c, i) => (
          <li className="lb-icard lb-arrive" key={c.id} style={{ "--i": i } as CSSProperties}>
            <Poster n={c.poster} kind={c.kind} />
            <div className="lb-icard-main">
              <p className="lb-icard-title">{t(`demo.titles.${c.id}`)}</p>
              <p className="lb-icard-meta"><span>{c.year}</span><TypeChip kind={c.kind} /></p>
              <div className="lb-icard-score">
                <AvatarStack who={[...c.who]} size={20} />
                <Ring pct={c.pct} size={26} />
                <span>{t("merge.friendsScore", { pct: c.pct, count: c.count })}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/* ── Why: chat-style fragments ───────────────────────────────────────── */
export function ChatFragments() {
  const t = useTranslations("landing.v2b");
  return (
    <div className="lb-chats">
      <p className="lb-chats-label">{t("why.examples")}</p>
      <ul className="lb-chat-list">
        {(["m1", "m2", "m3"] as const).map((k, i) => (
          <li key={k} className="lb-bubble" data-side={i % 2 ? "r" : "l"}>
            {t(`why.${k}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Friend flow phone ───────────────────────────────────────────────── */
const SEARCH_ROWS = [
  { id: "grand", year: 2014, kind: "movie", poster: 1, added: true },
  { id: "severance", year: 2022, kind: "series", poster: 2, added: true },
  { id: "pastLives", year: 2023, kind: "movie", poster: 3, added: true },
] as const;

export function FriendPhone() {
  const t = useTranslations("landing.v2b");
  return (
    <div className="lb-phone" aria-hidden="true">
      <div className="lb-phone-screen">
        <div className="lb-field-mock">
          <span className="lb-field-cap">{t("friends.nameLabel")}</span>
          <span className="lb-field-val">{t("demo.friends.jules")}</span>
        </div>
        <div className="lb-search-mock"><Icon name="search" size={16} /><span>{t("friends.search")}</span></div>
        <ul className="lb-rows">
          {SEARCH_ROWS.map((r) => (
            <li className="lb-row" key={r.id}>
              <Poster n={r.poster} kind={r.kind} />
              <span className="lb-row-main">
                <span className="lb-row-title">{t(`demo.titles.${r.id}`)}</span>
                <span className="lb-row-meta">{r.year} · {t(`type.${r.kind}`)}</span>
              </span>
              <span className="lb-add" data-on=""><Icon name="check" size={16} /></span>
            </li>
          ))}
        </ul>
        <div className="lb-tray">
          <span className="lb-tray-cap">{t("friends.picks")}</span>
          <span className="lb-tray-posters">
            {SEARCH_ROWS.map((r) => <Poster key={r.id} n={r.poster} kind={r.kind} />)}
          </span>
        </div>
        <span className="lb-send">
          <Icon name="send" size={16} />
          {t("friends.send", { owner: t("demo.owner"), count: 3 })}
        </span>
      </div>
    </div>
  );
}

/* ── How: three small product screens ────────────────────────────────── */
export function StepScreen({ step }: { step: 1 | 2 | 3 }) {
  const t = useTranslations("landing.v2b");
  if (step === 1) {
    return (
      <div className="lb-mini" aria-hidden="true">
        <div className="lb-linkpill"><Icon name="link" size={16} /><span className="lb-linkbar" /><span className="lb-copybtn">{t("demo.copy")}</span></div>
        <p className="lb-mini-cap">{t("demo.link")}</p>
        <ul className="lb-channels">
          {([["message", "message"], ["image", "story"], ["user", "person"]] as const).map(([icon, k]) => (
            <li key={k}><Icon name={icon} size={16} />{t(`demo.${k}`)}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (step === 2) {
    return (
      <div className="lb-mini" aria-hidden="true">
        <div className="lb-row">
          <Poster n={1} kind="movie" />
          <span className="lb-row-main">
            <span className="lb-row-title">{t("demo.titles.grand")}</span>
            <span className="lb-row-meta">2014 · {t("type.movie")}</span>
          </span>
          <span className="lb-add" data-on=""><Icon name="check" size={16} /></span>
        </div>
        <div className="lb-scorebar">
          <span className="lb-mini-cap">{t("demo.score")}</span>
          <span className="lb-track"><span className="lb-fill" /></span>
        </div>
        <p className="lb-reason"><span className="lb-mini-cap">{t("demo.reason")}</span>{t("demo.reasonText")}</p>
      </div>
    );
  }
  return (
    <div className="lb-mini" aria-hidden="true">
      <div className="lb-row">
        <Poster n={1} kind="movie" />
        <span className="lb-row-main">
          <span className="lb-row-title">{t("demo.titles.grand")}</span>
          <span className="lb-row-meta">2014 · {t("type.movie")}</span>
        </span>
      </div>
      <div className="lb-icard-score">
        <AvatarStack who={["alex", "maya", "jules"]} size={22} />
        <span>{t("demo.recommendedBy", { count: 3 })}</span>
      </div>
      <div className="lb-icard-score">
        <Ring pct={87} size={26} />
        <span>{t("merge.friendsScore", { pct: 87, count: 3 })}</span>
      </div>
    </div>
  );
}

/* ── Centerpiece card (static data; the wrapper animates it) ─────────── */
const MERGE_FRIENDS = [
  { who: "alex", pct: 90 },
  { who: "maya", pct: 85 },
  { who: "jules", pct: 86 },
] as const; // mean = 87

export function MergeCard() {
  const t = useTranslations("landing.v2b");
  return (
    <figure className="lb-merge-fig" role="img" aria-label={t("merge.alt")}>
      <article className="lb-mcard">
        <ul className="lb-mchips">
          {MERGE_FRIENDS.map((f, i) => (
            <li className="lb-mchip" key={f.who} style={{ "--i": i } as CSSProperties}>
              <Avatar who={f.who} size={22} />
              {t("merge.chip", { name: t(`demo.friends.${f.who}`), pct: f.pct })}
            </li>
          ))}
        </ul>
        <div className="lb-mcard-main">
          <Poster n={1} kind="movie" title={t("demo.titles.grand")} large />
          <div className="lb-mcard-body">
            <div className="lb-mcard-head">
              <h3 className="lb-mcard-title">{t("demo.titles.grand")}</h3>
              <p className="lb-icard-meta"><span>2014</span><TypeChip kind="movie" /></p>
            </div>
            <AvatarStack who={["alex", "maya", "jules"]} size={26} />
            <div className="lb-scores">
              <span className="lb-score"><Ring pct={87} size={38} /><span>{t("merge.friendsScore", { pct: 87, count: 3 })}</span></span>
              <span className="lb-score" data-tone="tmdb"><Ring pct={81} tone="tmdb" size={38} /><span>{t("merge.tmdbScore", { pct: 81 })}</span></span>
            </div>
            <p className="lb-avail">
              {(["stream", "rent", "buy"] as const).map((k) => <span className="lb-chip lb-chip-flat" key={k}>{t(`merge.${k}`)}</span>)}
              <small>{t("merge.via")}</small>
            </p>
            <blockquote className="lb-quote">
              <p>&ldquo;{t("merge.quote")}&rdquo;</p>
              <ExampleTag />
            </blockquote>
          </div>
        </div>
      </article>
    </figure>
  );
}

import type { CSSProperties } from "react";
import type { getTranslations } from "next-intl/server";

export type T = Awaited<ReturnType<typeof getTranslations>>;

const FRIENDS = ["f1", "f2", "f3", "f4", "f5"] as const;

export function Avatar({ t, id, n, size = 28 }: { t: T; id: (typeof FRIENDS)[number]; n: number; size?: number }) {
  const name = t(`demo.friends.${id}`);
  return (
    <span
      className="lp-av"
      style={{ "--s": size / 11, background: `var(--v2-lp-av-${n})` } as CSSProperties}
    >
      <span>{name.slice(0, 1)}</span>
    </span>
  );
}

export function Poster({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span className={`lp-poster ${className}`} style={{ background: `var(--v2-lp-poster-${n})` }}>
      <svg viewBox="0 0 24 24" width="40%" height="40%" fill="none" stroke="var(--v2-lp-poster-glyph)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m10 9.5 5 2.5-5 2.5z" fill="var(--v2-lp-poster-glyph)" />
      </svg>
    </span>
  );
}

export function Ring({ pct, size = 40, label, sub }: { pct: number; size?: number; label?: string; sub?: string }) {
  return (
    <span className="lp-ring" style={{ width: `${size / 11}em`, height: `${size / 11}em` }}>
      <svg viewBox="0 0 36 36" width="100%" height="100%">
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--v2-border)" strokeWidth="3.4" />
        <circle
          cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="3.4"
          strokeLinecap="round" pathLength={100} strokeDasharray={`${pct} 100`} transform="rotate(-90 18 18)"
        />
      </svg>
      <span className="lp-ring-n">{label ?? pct}%</span>
      {sub ? <span className="lp-sr">{sub}</span> : null}
    </span>
  );
}

function Bell() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7Z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </svg>
  );
}

function Search() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/** Owner inbox phone: top bar, friend rail with rings + badges, 3 cards. */
export function InboxPhone({ t }: { t: T }) {
  const rail: { id: (typeof FRIENDS)[number]; n: number; count: number }[] = [
    { id: "f1", n: 1, count: 2 },
    { id: "f2", n: 2, count: 1 },
    { id: "f3", n: 3, count: 3 },
    { id: "f4", n: 4, count: 0 },
  ];
  const cards = [
    { k: "c1", title: "t1", poster: 1, pct: 85, stack: [1, 2, 3], plat: "platformA" },
    { k: "c2", title: "t2", poster: 2, pct: 78, stack: [4, 2], plat: "platformB" },
    { k: "c3", title: "t3", poster: 6, pct: 92, stack: [3, 5], plat: "platformA" },
  ] as const;
  return (
    <div className="lp-phone" aria-hidden="true">
      <div className="lp-screen">
        <div className="lp-topbar">
          <span className="lp-topbar-t">{t("demo.inbox")}</span>
          <span className="lp-bell"><Bell /><i className="lp-dot" /></span>
        </div>
        <div className="lp-rail">
          <span className="lp-rail-i">
            <span className="lp-ringed lp-ringed-all"><span className="lp-av lp-av-all" style={{ "--s": 30 / 11 } as CSSProperties}><span>{t("demo.all")}</span></span></span>
            <b className="lp-badge">6</b>
          </span>
          {rail.map((f) => (
            <span className="lp-rail-i" key={f.id}>
              <span className={`lp-ringed ${f.count ? "" : "lp-ringed-seen"}`}>
                <Avatar t={t} id={f.id} n={f.n} size={30} />
              </span>
              {f.count ? <b className="lp-badge">{f.count}</b> : null}
            </span>
          ))}
        </div>
        <div className="lp-cards">
          {cards.map((c) => (
            <div className="lp-card" key={c.k}>
              <Poster n={c.poster} />
              <div className="lp-card-b">
                <div className="lp-card-t">{t(`demo.titles.${c.title}`)}</div>
                <div className="lp-card-m">{t(`demo.${c.k}.meta`)}</div>
                <div className="lp-card-q">“{t(`demo.${c.k}.quote`)}”</div>
                <div className="lp-card-f">
                  <span className="lp-stack">
                    {c.stack.map((n, i) => (
                      <Avatar key={i} t={t} id={FRIENDS[n - 1]} n={n} size={18} />
                    ))}
                  </span>
                  <span className="lp-chip">{t(`demo.${c.plat}`)}</span>
                </div>
              </div>
              <div className="lp-card-r">
                <Ring pct={c.pct} size={38} />
                <span className="lp-card-n">{t("demo.raters", { count: c.stack.length })}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Friend-flow phone: search, results, tray, slider with tooltip, send. */
export function FlowPhone({ t }: { t: T }) {
  return (
    <div className="lp-phone" aria-hidden="true">
      <div className="lp-screen">
        <div className="lp-flow-h">{t("flow.prompt")}</div>
        <div className="lp-search"><Search /><span>{t("flow.typed")}</span><i className="lp-caret" /></div>
        <div className="lp-results">
          {([["t1", 1], ["t4", 4]] as const).map(([title, n], i) => (
            <div className="lp-res" key={title}>
              <Poster n={n} className="lp-poster-s" />
              <div className="lp-res-b">
                <div className="lp-card-t">{t(`demo.titles.${title}`)}</div>
                <div className="lp-card-m">{t(i ? "demo.c3.meta" : "demo.c1.meta")}</div>
              </div>
              <span className={i ? "lp-add lp-add-on" : "lp-add"} />
            </div>
          ))}
        </div>
        <div className="lp-tray-l">{t("flow.picks")}</div>
        <div className="lp-tray">
          <Poster n={1} className="lp-poster-t" />
          <Poster n={4} className="lp-poster-t" />
        </div>
        <div className="lp-slider-w">
          <div className="lp-slider-l"><span>{t("flow.score")}</span></div>
          <div className="lp-slider">
            <span className="lp-slider-fill" />
            <span className="lp-slider-thumb">
              <span className="lp-tip">{t("flow.great")}</span>
            </span>
          </div>
          <div className="lp-ticks"><span>0</span><span>20</span><span>40</span><span>60</span><span>80</span><span>100</span></div>
        </div>
        <div className="lp-note">{t("flow.note")}</div>
        <div className="lp-send">{t("flow.send")}</div>
      </div>
    </div>
  );
}

/* ── Bento mini visuals ─────────────────────────────────────────────── */

export function MergeVisual({ t }: { t: T }) {
  const rows = [["f1", 1, 90], ["f2", 2, 80], ["f3", 3, 70]] as const;
  return (
    <div className="lp-mv" aria-hidden="true">
      <div className="lp-mv-in">
        {rows.map(([id, n, pct]) => (
          <span className="lp-pill" key={id}>
            <Avatar t={t} id={id} n={n} size={22} />
            <b>{pct}%</b>
          </span>
        ))}
      </div>
      <svg className="lp-mv-arrow" viewBox="0 0 40 24" width="40" height="24" fill="none" stroke="var(--v2-accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12h32M26 4l8 8-8 8" />
      </svg>
      <div className="lp-card lp-card-one">
        <Poster n={1} />
        <div className="lp-card-b">
          <div className="lp-card-t">{t("demo.titles.t1")}</div>
          <div className="lp-card-f">
            <span className="lp-stack">
              <Avatar t={t} id="f1" n={1} size={18} />
              <Avatar t={t} id="f2" n={2} size={18} />
              <Avatar t={t} id="f3" n={3} size={18} />
            </span>
          </div>
        </div>
        <div className="lp-card-r"><Ring pct={80} size={38} /><span className="lp-card-n">{t("demo.raters", { count: 3 })}</span></div>
      </div>
    </div>
  );
}

export function WhoVisual({ t }: { t: T }) {
  const rail = [["f1", 1, 2], ["f2", 2, 1], ["f3", 3, 3]] as const;
  return (
    <div className="lp-wv" aria-hidden="true">
      {rail.map(([id, n, c], i) => (
        <span className="lp-rail-i" key={id}>
          <span className={`lp-ringed ${i === 2 ? "lp-ringed-sel" : ""}`}><Avatar t={t} id={id} n={n} size={40} /></span>
          <b className="lp-badge">{c}</b>
        </span>
      ))}
    </div>
  );
}

export function WhereVisual({ t }: { t: T }) {
  return (
    <div className="lp-whv" aria-hidden="true">
      <span className="lp-region">{t("demo.region")}</span>
      <span className="lp-chip lp-chip-l">{t("demo.platformA")}</span>
      <span className="lp-chip lp-chip-l">{t("demo.platformB")}</span>
    </div>
  );
}

export function HonestVisual({ t }: { t: T }) {
  return (
    <div className="lp-hv" aria-hidden="true">
      <div className="lp-hv-i lp-hv-f"><Ring pct={80} size={52} /><span>{t("demo.friendsLabel")}</span></div>
      <div className="lp-hv-sep" />
      <div className="lp-hv-i lp-hv-p"><Ring pct={72} size={52} /><span>{t("demo.publicLabel")}</span></div>
    </div>
  );
}

export function NotifyVisual({ t }: { t: T }) {
  return (
    <div className="lp-nv" aria-hidden="true">
      <span className="lp-nv-bell"><Bell /></span>
      <div className="lp-nv-t">
        <Avatar t={t} id="f1" n={1} size={24} />
        <span>{t("demo.newPick", { name: t("demo.friends.f1") })}</span>
      </div>
    </div>
  );
}

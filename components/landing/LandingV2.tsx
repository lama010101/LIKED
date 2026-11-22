import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { LANGUAGES } from "@/lib/i18n/languages";
import LanguageSwitcher from "./LanguageSwitcher";
import RevealObserver from "./RevealObserver";
import {
  FlowPhone,
  HonestVisual,
  InboxPhone,
  MergeVisual,
  NotifyVisual,
  WhereVisual,
  WhoVisual,
} from "./visuals";
import "./landing.css";

// Public landing for the v2 Recommendation Inbox pitch (PRD v2.6).
// Server Component. CTA targets mirror the previous landing: /signup
// (primary) and /login. Copy lives in messages/*.json under `landing`.
export default async function LandingV2() {
  const t = await getTranslations("landing");

  const cta = (
    <a href="/signup" className="lp-btn lp-btn-p">
      {t("hero.cta")}
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </a>
  );

  const steps = ["s1", "s2", "s3"] as const;
  const bento = [
    { k: "merged", cls: "lp-b-merged", visual: <MergeVisual t={t} /> },
    { k: "who", cls: "lp-b-who", visual: <WhoVisual t={t} /> },
    { k: "where", cls: "lp-b-where", visual: <WhereVisual t={t} /> },
    { k: "honest", cls: "lp-b-honest", visual: <HonestVisual t={t} /> },
    { k: "notify", cls: "lp-b-notify", visual: <NotifyVisual t={t} /> },
  ] as const;

  return (
    <div data-ui="v2" className="lp">
      <RevealObserver />
      <a href="#main" className="lp-skip">{t("skip")}</a>

      <header className="lp-nav">
        <div className="lp-wrap lp-nav-in">
          <Link href="/" className="lp-brand" aria-label={t("nav.home")}>
            <Image src="/logo-48.png" alt="" width={36} height={36} className="lp-logo" priority />
            <span className="lp-wordmark">liked<span className="lp-dotm">.</span></span>
          </Link>
          <nav className="lp-nav-r" aria-label={t("nav.label")}>
            <LanguageSwitcher />
            <a href="/login" className="lp-link">{t("nav.login")}</a>
            <a href="/signup" className="lp-btn lp-btn-p lp-btn-s lp-nav-cta">{t("nav.cta")}</a>
          </nav>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="lp-hero" aria-labelledby="lp-h1">
          <div className="lp-hero-bg" aria-hidden="true"><i className="lp-glow" /><i className="lp-grain" /></div>
          <div className="lp-wrap lp-hero-in">
            <div className="lp-hero-copy">
              <p className="lp-eyebrow">{t("hero.eyebrow")}</p>
              <h1 id="lp-h1" className="lp-h1">
                {t.rich("hero.title", { hl: (c) => <span className="lp-hl">{c}</span> })}
              </h1>
              <p className="lp-sub">{t("hero.sub")}</p>
              <div className="lp-cta-row">
                {cta}
                <a href="#how" className="lp-btn lp-btn-g">{t("hero.secondary")}</a>
              </div>
              <p className="lp-micro">{t("hero.micro")}</p>
            </div>
            <figure className="lp-hero-vis lp-in" style={{ animationDelay: "200ms" }}>
              <div className="lp-float"><InboxPhone t={t} /></div>
              <div className="lp-toast" aria-hidden="true">
                <span className="lp-toast-d" />
                <span>{t("demo.newPick", { name: t("demo.friends.f2") })}</span>
              </div>
              <figcaption className="lp-sr">{t("hero.alt")}</figcaption>
            </figure>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="lp-sec" aria-labelledby="lp-how">
          <div className="lp-wrap">
            <h2 id="lp-how" className="lp-h2" data-reveal>{t("how.title")}</h2>
            <ol className="lp-steps">
              {steps.map((s, i) => (
                <li className="lp-step" key={s} data-reveal style={{ transitionDelay: `${i * 90}ms` }}>
                  <span className="lp-step-n" aria-hidden="true">{i + 1}</span>
                  <h3 className="lp-h3">{t(`how.${s}.title`)}</h3>
                  <p className="lp-p">{t(`how.${s}.body`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Friend flow */}
        <section className="lp-sec lp-flow" aria-labelledby="lp-flow">
          <div className="lp-wrap lp-flow-in">
            <figure className="lp-flow-vis" data-reveal>
              <FlowPhone t={t} />
              <figcaption className="lp-sr">{t("flow.alt")}</figcaption>
            </figure>
            <div className="lp-flow-copy" data-reveal>
              <p className="lp-eyebrow">{t("flow.eyebrow")}</p>
              <h2 id="lp-flow" className="lp-h2">{t("flow.title")}</h2>
              <p className="lp-lead">{t("flow.body")}</p>
            </div>
          </div>
        </section>

        {/* Inbox bento */}
        <section className="lp-sec" aria-labelledby="lp-bento">
          <div className="lp-wrap">
            <p className="lp-eyebrow" data-reveal>{t("bento.eyebrow")}</p>
            <h2 id="lp-bento" className="lp-h2" data-reveal>{t("bento.title")}</h2>
            <div className="lp-bento">
              {bento.map((b, i) => (
                <article className={`lp-bcard ${b.cls}`} key={b.k} data-reveal style={{ transitionDelay: `${i * 70}ms` }}>
                  <div className="lp-bvis">{b.visual}</div>
                  <span className="lp-sr">{t(`bento.alt.${b.k}`)}</span>
                  <h3 className="lp-h3">{t(`bento.${b.k}.title`)}</h3>
                  <p className="lp-p">{t(`bento.${b.k}.body`)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Languages strip */}
        <section className="lp-sec lp-lang" aria-labelledby="lp-lang">
          <div className="lp-wrap lp-lang-in" data-reveal>
            <div>
              <h2 id="lp-lang" className="lp-h2 lp-h2-s">{t("languages.title")}</h2>
              <p className="lp-p">{t("languages.body")}</p>
            </div>
            <ul className="lp-langs">
              {LANGUAGES.map((l) => (
                <li key={l.code} lang={l.code} className="lp-langpill">{l.nativeName}</li>
              ))}
              <li className="lp-modepill">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
                {t("languages.light")}
              </li>
              <li className="lp-modepill">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" /></svg>
                {t("languages.dark")}
              </li>
            </ul>
          </div>
        </section>

        {/* Final CTA */}
        <section className="lp-final" aria-labelledby="lp-final">
          <div className="lp-wrap lp-final-in" data-reveal>
            <h2 id="lp-final" className="lp-h2 lp-final-h">{t("final.title")}</h2>
            <a href="/signup" className="lp-btn lp-btn-inv">{t("final.cta")}</a>
            <p className="lp-micro lp-final-m">{t("hero.micro")}</p>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-in">
          <Link href="/" className="lp-brand" aria-label={t("nav.home")}>
            <Image src="/logo-48.png" alt="" width={28} height={28} className="lp-logo" />
            <span className="lp-wordmark">liked<span className="lp-dotm">.</span></span>
          </Link>
          <nav aria-label={t("footer.nav")} className="lp-footer-nav">
            <a href="/privacy" className="lp-link">{t("footer.privacy")}</a>
            <a href="/terms" className="lp-link">{t("footer.terms")}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

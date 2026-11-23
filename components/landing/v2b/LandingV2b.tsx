import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { isWaitlistFormEnabled } from "@/lib/landing/waitlist";
import LanguageSwitcher from "../LanguageSwitcher";
import { CONTACT_EMAIL, LEGAL_LINKS } from "./config";
import HeaderAuth from "./HeaderAuth";
import { Icon, type IconName } from "./icons";
import MergeStage from "./MergeStage";
import { ChatFragments, FriendPhone, InboxPreview, MergeCard, StepScreen } from "./previews";
import WaitlistForm from "./WaitlistForm";
import "../landing.css"; // shared .lp-switch* styles for the reused LanguageSwitcher
import "./v2b.css";

// Pre-launch landing "v2b" (V2-LANDING-002-A). Server Component; every string
// comes from messages/*.json under landing.v2b. No database, no analytics, no
// third-party script. The only client islands are: LanguageSwitcher (reused),
// HeaderAuth, WaitlistForm and MergeStage.
export default async function LandingV2b() {
  const t = await getTranslations("landing.v2b");
  const formEnabled = isWaitlistFormEnabled();
  const mail = (chunks: React.ReactNode) => <a href={`mailto:${CONTACT_EMAIL}`}>{chunks}</a>;

  const steps = ["s1", "s2", "s3"] as const;
  const coming: { k: "rail" | "where" | "filters" | "tidy"; icon: IconName }[] = [
    { k: "rail", icon: "users" },
    { k: "where", icon: "pin" },
    { k: "filters", icon: "sliders" },
    { k: "tidy", icon: "eyeOff" },
  ];
  const faq = ["q1", "q2", "q3", "q4", "q5"] as const;

  return (
    <div data-ui="v2" data-landing="v2b" className="lb">
      <a href="#main" className="lb-skip">{t("skip")}</a>

      <header className="lb-header">
        <div className="lb-wrap lb-header-in">
          <Link href="/" className="lb-brand" aria-label={t("header.home")}>
            <span className="lb-wordmark">liked<span className="lb-dotm">.</span></span>
          </Link>
          <nav className="lb-nav" aria-label={t("header.nav")}>
            <LanguageSwitcher />
            <HeaderAuth />
          </nav>
        </div>
      </header>

      <main id="main">
        {/* 1. Hero */}
        <section className="lb-hero" aria-labelledby="lb-h1">
          <div className="lb-hero-bg" aria-hidden="true" />
          <div className="lb-wrap lb-hero-in">
            <div className="lb-hero-copy">
              <p className="lb-badge"><span className="lb-badge-dot" aria-hidden="true" />{t("badge")}</p>
              <p className="lb-eyebrow">{t("hero.eyebrow")}</p>
              <h1 id="lb-h1" className="lb-h1">{t("hero.title")}</h1>
              <p className="lb-sub">{t("hero.sub")}</p>
              <WaitlistForm enabled={formEnabled} />
            </div>
            <div className="lb-hero-vis"><InboxPreview /></div>
          </div>
        </section>

        {/* 2. Why */}
        <section className="lb-sec" aria-labelledby="lb-why">
          <div className="lb-wrap lb-why">
            <div>
              <h2 id="lb-why" className="lb-h2">{t("why.title")}</h2>
              <p className="lb-oneline">{t("why.line")}</p>
            </div>
            <ChatFragments />
          </div>
        </section>

        {/* 3. How it will work */}
        <section className="lb-sec lb-sec-tint" aria-labelledby="lb-how">
          <div className="lb-wrap">
            <h2 id="lb-how" className="lb-h2">{t("how.title")}</h2>
            <ol className="lb-steps">
              {steps.map((s, i) => (
                <li className="lb-step" key={s}>
                  <StepScreen step={(i + 1) as 1 | 2 | 3} />
                  <h3 className="lb-h3"><span className="lb-step-n" aria-hidden="true">{i + 1}</span>{t(`how.${s}.title`)}</h3>
                  <p className="lb-p">{t(`how.${s}.body`)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* 4. Friends */}
        <section className="lb-sec" aria-labelledby="lb-friends">
          <div className="lb-wrap lb-friends">
            <figure className="lb-friends-vis">
              <FriendPhone />
              <figcaption className="lb-sr">{t("friends.alt")}</figcaption>
            </figure>
            <div className="lb-friends-copy">
              <p className="lb-eyebrow">{t("friends.eyebrow")}</p>
              <h2 id="lb-friends" className="lb-h2">{t("friends.title")}</h2>
              <ul className="lb-checks">
                {(["b1", "b2", "b3"] as const).map((b) => (
                  <li key={b}><Icon name="check" size={18} /><span>{t(`friends.${b}`)}</span></li>
                ))}
              </ul>
              <p className="lb-reassure"><Icon name="lock" size={18} /><span>{t("friends.reassure")}</span></p>
            </div>
          </div>
        </section>

        {/* 5. Centerpiece */}
        <section className="lb-sec lb-sec-tint" aria-labelledby="lb-merge">
          <div className="lb-wrap lb-center">
            <h2 id="lb-merge" className="lb-h2">{t("merge.title")}</h2>
            <MergeStage className="lb-merge">
              <MergeCard />
            </MergeStage>
            <p className="lb-caption">{t("merge.caption")}</p>
          </div>
        </section>

        {/* 6. What's coming */}
        <section className="lb-sec" aria-labelledby="lb-coming">
          <div className="lb-wrap">
            <h2 id="lb-coming" className="lb-h2 lb-h2-s">{t("coming.title")}</h2>
            <ul className="lb-coming">
              {coming.map((c) => (
                <li className="lb-coming-item" key={c.k}>
                  <span className="lb-coming-ico"><Icon name={c.icon} size={20} /></span>
                  <div>
                    <h3 className="lb-h3">{t(`coming.${c.k}.title`)}</h3>
                    <p className="lb-p">{t(`coming.${c.k}.body`)}</p>
                    <span className="lb-tag">{t("coming.tag")}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 7. FAQ */}
        <section className="lb-sec lb-sec-tint" aria-labelledby="lb-faq">
          <div className="lb-wrap lb-faq-wrap">
            <h2 id="lb-faq" className="lb-h2 lb-h2-s">{t("faq.title")}</h2>
            <div className="lb-faq">
              {faq.map((k) => (
                <details className="lb-faq-item" key={k}>
                  <summary><span>{t(`faq.${k}.q`)}</span><Icon name="chevron" size={20} className="lb-faq-chev" /></summary>
                  <p>{k === "q5" ? t.rich("faq.q5.a", { email: CONTACT_EMAIL, mail }) : t(`faq.${k}.a`)}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* 8. Final CTA */}
        <section className="lb-final" aria-labelledby="lb-final">
          <div className="lb-wrap lb-final-in">
            <h2 id="lb-final" className="lb-h2">{t("final.title")}</h2>
            <p className="lb-sub">{t("final.sub")}</p>
            <WaitlistForm enabled={formEnabled} />
          </div>
        </section>
      </main>

      <footer className="lb-footer">
        <div className="lb-wrap lb-footer-in">
          <nav aria-label={t("footer.nav")} className="lb-footer-nav">
            <a href={LEGAL_LINKS.privacy}>{t("footer.privacy")}</a>
            <a href={LEGAL_LINKS.terms}>{t("footer.terms")}</a>
            <a href={LEGAL_LINKS.credits}>{t("footer.credits")}</a>
            <span className="lb-footer-help">
              <a href={LEGAL_LINKS.help}>{t("footer.help")}</a>
              <span aria-hidden="true">(</span><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a><span aria-hidden="true">)</span>
            </span>
          </nav>
          <div className="lb-footer-switch"><LanguageSwitcher /></div>
          {/* Attribution: exact English text, kept in every catalog. Official
              TMDB / JustWatch logos are not in the repo, so text only. */}
          <div className="lb-attrib" lang="en">
            <p>{t("footer.tmdb")}</p>
            <p>{t("footer.justwatch")}</p>
          </div>
          <p className="lb-copy">{t("footer.copyright")}</p>
        </div>
      </footer>
    </div>
  );
}

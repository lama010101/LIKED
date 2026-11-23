import { getTranslations } from "next-intl/server";
import { LANDING_QUERY, LANDING_VARIANTS, type LandingVariant } from "./config";
import "./landing-switch.css";

// Floating QA pill, rendered ONLY while an override (query or cookie) is
// active. "Landing: <variant> v" opens a list: legacy / v2a / v2b / Default.
// Native <details>: keyboard-operable, no JS. Plain <a> links so every flip is
// a full navigation (the server re-resolves and the sync island rewrites the
// cookie). Variant ids are technical constants, not translated.
export default async function LandingSwitchPill({ current }: { current: LandingVariant }) {
  const t = await getTranslations("landing.v2b.pill");
  const href = (v: string) => `/?${LANDING_QUERY}=${v}`;
  return (
    <div data-ui="v2" className="lsw" data-testid="landing-pill">
      <details className="lsw-box">
        <summary className="lsw-sum" aria-label={`${t("label")}: ${current}. ${t("menu")}`}>
          <span>{t("label")}: <b>{current}</b></span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
        </summary>
        <ul className="lsw-list" aria-label={t("menu")}>
          {LANDING_VARIANTS.map((v) => (
            <li key={v}>
              <a href={href(v)} aria-current={v === current ? "true" : undefined}>{v}</a>
            </li>
          ))}
          <li><a href={href("default")}>{t("default")}</a></li>
        </ul>
      </details>
    </div>
  );
}

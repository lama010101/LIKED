import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("legal.terms");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

// PLACEHOLDER tokens (plan §10 L9): replace before release.
// LEGAL_ENTITY = developer legal name; CONTACT_EMAIL = published support address.
const LEGAL_ENTITY = "[LEGAL ENTITY NAME — PLACEHOLDER]";
const CONTACT_EMAIL = "[SUPPORT EMAIL — PLACEHOLDER]";

const linkStyle: React.CSSProperties = {
  color: "var(--accent-light)",
  fontWeight: 600,
};

const rich = {
  strong: (chunks: React.ReactNode) => (
    <strong style={{ color: "var(--text-1)" }}>{chunks}</strong>
  ),
  contactEmail: () =>
    CONTACT_EMAIL.includes("@") ? (
      <a href={`mailto:${CONTACT_EMAIL}`} style={linkStyle}>
        {CONTACT_EMAIL}
      </a>
    ) : (
      <span style={{ color: "var(--text-1)", fontWeight: 600 }}>
        {CONTACT_EMAIL}
      </span>
    ),
};

export default async function TermsOfServicePage() {
  const t = await getTranslations("legal.terms");
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        padding: "48px 24px",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <article
        style={{
          maxWidth: 720,
          width: "100%",
          background: "var(--surface-1)",
          border: "1px solid var(--border-1)",
          borderRadius: "var(--r-xl)",
          padding: "40px 32px",
          boxShadow: "var(--shadow-lg)",
          color: "var(--text-1)",
        }}
      >
        <header style={{ marginBottom: 32 }}>
          <h1
            className="font-serif"
            style={{
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              marginBottom: 8,
            }}
          >
            liked<span style={{ color: "var(--accent)" }}>.</span>
          </h1>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text-1)",
              marginBottom: 4,
            }}
          >
            {t("title")}
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-3)" }}>
            {t("lastUpdated")}
          </p>
        </header>

        <div
          style={{
            fontSize: 15,
            lineHeight: 1.7,
            color: "var(--text-2)",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <section>
            <h3 style={sectionHeading}>{t("s1.title")}</h3>
            <p>{t("s1.body")}</p>
          </section>

          <section>
            <h3 style={sectionHeading}>{t("s2.title")}</h3>
            <p>{t("s2.body")}</p>
          </section>

          <section>
            <h3 style={sectionHeading}>{t("s3.title")}</h3>
            <p>{t("s3.body")}</p>
          </section>

          <section>
            <h3 style={sectionHeading}>{t("s4.title")}</h3>
            <p>{t("s4.intro")}</p>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>{t("s4.item1")}</li>
              <li>{t("s4.item2")}</li>
              <li>{t("s4.item3")}</li>
              <li>{t("s4.item4")}</li>
              <li>{t("s4.item5")}</li>
            </ul>
          </section>

          <section>
            <h3 style={sectionHeading}>{t("s5.title")}</h3>
            <p>{t("s5.body")}</p>
          </section>

          <section>
            <h3 style={sectionHeading}>{t("s6.title")}</h3>
            <p>{t("s6.body")}</p>
          </section>

          <section>
            <h3 style={sectionHeading}>{t("s7.title")}</h3>
            <p style={{ marginBottom: 12 }}>{t("s7.deletion")}</p>
            <p>{t("s7.termination")}</p>
          </section>

          <section>
            <h3 style={sectionHeading}>{t("s8.title")}</h3>
            <p>{t("s8.body")}</p>
          </section>

          <section>
            <h3 style={sectionHeading}>{t("s9.title")}</h3>
            <p>{t("s9.body")}</p>
          </section>

          <section>
            <h3 style={sectionHeading}>{t("s10.title")}</h3>
            <p>{t("s10.body")}</p>
          </section>

          <section>
            <h3 style={sectionHeading}>{t("s11.title")}</h3>
            <p>{t.rich("s11.contact", { ...rich, entity: LEGAL_ENTITY })}</p>
          </section>
        </div>

        <footer style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--border-1)" }}>
          <Link
            href="/"
            style={{
              color: "var(--accent-light)",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {t("back")}
          </Link>
        </footer>
      </article>
    </div>
  );
}

const sectionHeading: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 700,
  color: "var(--text-1)",
  marginBottom: 8,
};

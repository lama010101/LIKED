import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - LIKED",
  description: "The terms and conditions for using LIKED.",
};

export default function TermsOfServicePage() {
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
            Terms of Service
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-3)" }}>
            Last updated: September 6, 2026
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
            <h3 style={sectionHeading}>1. Acceptance of Terms</h3>
            <p>
              By creating an account or otherwise accessing or using LIKED (the
              &quot;Service&quot;), you agree to be bound by these Terms of
              Service. If you do not agree, you may not access or use the
              Service.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>2. Your Account</h3>
            <p>
              You are responsible for maintaining the security of your account
              and for all activity that occurs under your account. You must
              provide accurate information when registering and keep it up to
              date. You must be at least 13 years old (or the minimum age
              required in your jurisdiction) to use the Service.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>3. Your Content</h3>
            <p>
              You retain ownership of the content you submit to LIKED. You are
              solely responsible for your content and for ensuring you have the
              rights to share it. By submitting content, you grant LIKED a
              worldwide, non-exclusive, royalty-free license to host, store,
              display, and transmit that content as necessary to operate the
              Service.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>4. Acceptable Use</h3>
            <p>You agree not to:</p>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Use the Service for any unlawful purpose or in violation of these Terms.</li>
              <li>Submit content that infringes the rights of others, including intellectual property or privacy rights.</li>
              <li>Harass, abuse, or harm other users.</li>
              <li>Attempt to access accounts, data, or systems you are not authorized to access.</li>
              <li>Interfere with or disrupt the Service or its servers.</li>
            </ul>
          </section>

          <section>
            <h3 style={sectionHeading}>5. Visibility and Sharing</h3>
            <p>
              LIKED uses an edge-based visibility system. You control who can
              see your content by creating connections. You are responsible for
              your sharing decisions. Once content is shared with another user,
              LIKED cannot guarantee it will not be further shared by that
              user.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>6. Termination</h3>
            <p>
              You may delete your account at any time. We may suspend or
              terminate your access to the Service if you violate these Terms or
              if we believe your conduct harms the Service or other users.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>7. Disclaimers</h3>
            <p>
              The Service is provided &quot;as is&quot; and &quot;as
              available&quot; without warranties of any kind, whether express or
              implied. We do not guarantee that the Service will be
              uninterrupted, secure, or error-free.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>8. Limitation of Liability</h3>
            <p>
              To the maximum extent permitted by law, LIKED and its operators
              shall not be liable for any indirect, incidental, special, or
              consequential damages arising from your use of, or inability to
              use, the Service.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>9. Changes to These Terms</h3>
            <p>
              We may modify these Terms from time to time. We will notify you of
              material changes by posting the updated Terms on this page and
              updating the &quot;Last updated&quot; date above. Continued use of
              the Service after changes take effect constitutes acceptance of
              the revised Terms.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>10. Contact Us</h3>
            <p>
              If you have questions about these Terms, please contact us at{" "}
              <a
                href="mailto:terms@liked.app"
                style={{ color: "var(--accent-light)", fontWeight: 600 }}
              >
                terms@liked.app
              </a>
              .
            </p>
          </section>
        </div>

        <footer style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--border-1)" }}>
          <a
            href="/signup"
            style={{
              color: "var(--accent-light)",
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            &larr; Back to sign up
          </a>
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

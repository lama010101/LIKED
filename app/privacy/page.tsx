import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How LIKED collects, uses, shares, and protects your information.",
};

export default function PrivacyPolicyPage() {
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
            Privacy Policy
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
            <p>
              LIKED (&quot;we&quot;, &quot;us&quot;, or &quot;the app&quot;) is a
              recommendation-sharing web application that lets signed-in owners
              ask friends for film, series, documentary, and YouTube
              recommendations. Friends can contribute as guests through a shared
              link without creating an account. This Privacy Policy explains what
              information we collect about owners, guests, and contributors, how
              we use it, who we share it with, and the choices you have.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>1. Information We Collect</h3>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "var(--text-1)" }}>
                Account information:
              </strong>{" "}
              When you create an account, we collect your email address, display
              name, and profile avatar. If you sign up or sign in with Google, we
              receive the name, email address, and profile picture associated
              with your Google account, as well as a Google-assigned
              authentication identifier. We do not request and do not receive
              your Google password.
            </p>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "var(--text-1)" }}>
                Guest contributor information:
              </strong>{" "}
              When an owner shares a recommendation link, guests may provide a
              display name and submit ratings, platform notes, comments, and
              titles they recommend. Guest contributors do not create a LIKED
              account or provide an email address to use that link.
            </p>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "var(--text-1)" }}>
                Content you create:
              </strong>{" "}
              We store recommendations, ratings, comments, platform notes,
              owner inbox state, sharing links, and the connections needed to
              show each owner the recommendations intended for them. For YouTube
              videos, we may retrieve and temporarily store display metadata such
              as the video title, thumbnail, duration, and trailer link so the
              recommendation can be displayed.
            </p>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "var(--text-1)" }}>Usage data:</strong>{" "}
              We automatically collect information about how you interact with
              LIKED, including the pages you view, the actions you take, your
              approximate device type, browser type and version, and the dates
              and times of your visits.
            </p>
            <p style={{ marginBottom: 12 }}>
              <strong style={{ color: "var(--text-1)" }}>
                Technical and authentication data:
              </strong>{" "}
              To keep you signed in and secure your account, we store
              authentication tokens and session identifiers in your browser&apos;s
              local storage and cookies. We also log IP addresses, request
              timestamps, and error logs for security, abuse prevention, and
              troubleshooting.
            </p>
            <p>
              <strong style={{ color: "var(--text-1)" }}>
                Information we do not collect:
              </strong>{" "}
              We do not collect precise geolocation data, financial information,
              government identifiers, or the contents of your communications on
              other platforms. We do not request access to your contacts, camera,
              microphone, or files on your device.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>2. How We Use Your Information</h3>
            <p>We use the information we collect to:</p>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
              <li>Create, maintain, and authenticate your account and profile.</li>
              <li>Store, display, and share the content you create according to the visibility you choose through your connections.</li>
              <li>Generate previews and metadata for the links you save (for example, fetching a YouTube video&apos;s title and thumbnail).</li>
              <li>Send notifications about activity relevant to you, such as content shared with you by other users.</li>
              <li>Operate, monitor, secure, and improve the service, including debugging and preventing fraud or abuse.</li>
              <li>Comply with our legal obligations and enforce our Terms of Service.</li>
            </ul>
            <p style={{ marginTop: 12 }}>
              We do not use your information to train automated models, and we do
              not sell your personal information to third parties.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>3. Cookies and Local Storage</h3>
            <p>
              LIKED uses cookies and browser local storage to keep you signed in,
              remember your session, and store your preferences (such as your
              selected view mode and theme). Authentication tokens stored in your
              browser are used solely to verify your identity with our backend
              and are removed when you sign out. We do not use cookies for
              cross-site advertising or third-party tracking. You can clear
              cookies and local storage at any time through your browser
              settings, which will sign you out of LIKED.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>4. Third-Party Services</h3>
            <p style={{ marginBottom: 12 }}>
              We rely on the following third-party providers to operate LIKED.
              Each provider processes information only as needed to deliver the
              service described, and is governed by its own privacy policy:
            </p>
            <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8 }}>
              <li>
                <strong style={{ color: "var(--text-1)" }}>Google</strong> — used
                for optional &quot;Sign in with Google&quot; authentication. When
                you use this feature, Google shares your name, email address, and
                profile picture with LIKED. Google also sets its own cookies as
                part of the sign-in flow. See{" "}
                <a href="https://policies.google.com/privacy" style={linkStyle} target="_blank" rel="noopener noreferrer">
                  Google&apos;s Privacy Policy
                </a>
                . You can revoke LIKED&apos;s access to your Google account at any
                time from your Google Account permissions page at{" "}
                <a href="https://myaccount.google.com/permissions" style={linkStyle} target="_blank" rel="noopener noreferrer">
                  myaccount.google.com/permissions
                </a>
                .
              </li>
              <li>
                <strong style={{ color: "var(--text-1)" }}>The Movie Database (TMDB)</strong> —
                used to retrieve film, series, documentary, genre, rating, poster,
                and metadata shown in recommendations. TMDB does not receive your
                account email address or guest contributor identity from LIKED.
              </li>
              <li>
                <strong style={{ color: "var(--text-1)" }}>YouTube</strong> —
                used to retrieve video titles, thumbnails, durations, and trailer
                links for YouTube recommendations. YouTube is a Google service;
                see Google&apos;s Privacy Policy linked above. We store YouTube
                display metadata only as described in the retention section.
              </li>
              <li>
                <strong style={{ color: "var(--text-1)" }}>Supabase</strong> —
                our database and authentication provider. Supabase stores your
                account data, content, and session information on our behalf in
                the region where our project is hosted. See{" "}
                <a href="https://supabase.com/privacy" style={linkStyle} target="_blank" rel="noopener noreferrer">
                  Supabase&apos;s Privacy Policy
                </a>
                .
              </li>
              <li>
                <strong style={{ color: "var(--text-1)" }}>Vercel</strong> — our
                hosting provider. Vercel serves the LIKED website and may log
                request metadata (such as IP address and request time) for
                delivery, security, and performance. See{" "}
                <a href="https://vercel.com/legal/privacy-policy" style={linkStyle} target="_blank" rel="noopener noreferrer">
                  Vercel&apos;s Privacy Policy
                </a>
                .
              </li>
            </ul>
            <p style={{ marginTop: 12 }}>
              When you save a link, we may fetch publicly available metadata
              (such as a page title or image) from the linked website. That
              website may independently log the request. We do not share your
              account information with those websites.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>5. Sharing and Visibility</h3>
            <p>
              LIKED is built around an edge-based visibility model. The content
              you share is visible only to the users you have explicitly
              connected to, according to the connections you create. We do not
              make your content public unless you choose to. We share information
              with our service providers (listed above) only as necessary to
              operate LIKED, and we may disclose information when required by law
              or to protect our rights, users, or the service.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>6. Data Retention</h3>
            <p>
              We retain owner account information and recommendations for as long
              as the owner account is active. Guest contributors who remain
              inactive for 18 months are purged. YouTube display metadata is
              retained for no more than 30 days before it is refreshed or
              deleted. Security logs, authentication logs, and error logs are
              retained for no more than 30 days unless a longer retention period
              is required by law or an active security investigation. Backup
              copies are retained according to the backup retention policy of
              our database and hosting providers, and are deleted when those
              provider backups expire.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>7. Security</h3>
            <p>
              We take reasonable measures to protect your information, including
              encrypted authentication, access controls, and row-level database
              security policies that restrict data access to authorized users.
              However, no method of transmission or storage is completely secure,
              and we cannot guarantee absolute security. We will notify affected
              users of any material data breach in accordance with applicable
              law.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>8. Your Rights and Deletion</h3>
            <p>
              Depending on your jurisdiction, you may have the right to access,
              correct, export, or delete your personal information, and to object
              to or restrict certain processing. Owners can delete their account
              in the app or through the public <Link href="/delete-account" style={linkStyle}>/delete-account</Link> page.
              Guest contributors can use the deletion control provided in the
              guest recommendation flow. You may also request deletion by email
              using the contact address below; verified email deletion requests
              are processed within 30 days.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>9. International Data Transfers</h3>
            <p>
              LIKED and its service providers process and store data in regions
              that may differ from your country of residence. By using LIKED, you
              acknowledge that your information may be transferred to and
              processed in such regions, subject to applicable data protection
              laws.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>10. Children&apos;s Privacy</h3>
            <p>
              LIKED is not directed to children under 13 (or the minimum age
              required in your jurisdiction). We do not knowingly collect
              personal information from children. If you believe we have
              collected information from a child, please contact us and we will
              delete it.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>11. Changes to This Policy</h3>
            <p>
              We may update this Privacy Policy from time to time. We will
              notify you of material changes by posting the updated policy on
              this page and updating the &quot;Last updated&quot; date above.
              Continued use of LIKED after a change constitutes acceptance of the
              updated policy.
            </p>
          </section>

          <section>
            <h3 style={sectionHeading}>12. Contact Us</h3>
            <p>
              If you have questions about this Privacy Policy or wish to exercise
              your data rights, please contact us at{" "}
              <a
                href="mailto:privacy@liked.app"
                style={{ color: "var(--accent-light)", fontWeight: 600 }}
              >
                privacy@liked.app
              </a>
              .
            </p>
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
            &larr; Back to LIKED
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

const linkStyle: React.CSSProperties = {
  color: "var(--accent-light)",
  fontWeight: 600,
};

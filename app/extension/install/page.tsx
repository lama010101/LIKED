"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Chrome Extension install page.
 *
 * Reached from the Profile modal → "Install Chrome Extension".
 *
 * Desktop (Windows / Mac / Linux, Chrome): download the ZIP, extract,
 * load unpacked at chrome://extensions. One-click "Add to Chrome" is
 * shown instead when NEXT_PUBLIC_CHROME_WEBSTORE_URL is set.
 *
 * Android: Chrome for Android cannot install extensions — the page
 * routes to Microsoft Edge Canary (the only Android browser that
 * sideloads extensions since Kiwi's shutdown) using the .crx build
 * produced by `npm run crx:extension`. The .crx is signed with the same
 * pinned key, so the extension ID — and the /extension/auth relay —
 * stay identical to desktop installs.
 *
 * iOS: no browser there supports this extension — desktop only.
 */
type Platform = "desktop" | "android" | "ios" | "other";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/windows|macintosh|linux|x11|cros/i.test(ua)) return "desktop";
  return "other";
}

const PLATFORM_LABEL: Record<Platform, string> = {
  desktop: "Windows / Mac / Linux",
  android: "Android",
  ios: "iPhone / iPad",
  other: "this device",
};

export default function ExtensionInstallPage() {
  const [downloaded, setDownloaded] = useState(false);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [detected, setDetected] = useState<Platform>("desktop");
  const [copied, setCopied] = useState(false);

  const webStoreUrl = process.env.NEXT_PUBLIC_CHROME_WEBSTORE_URL;
  const zipUrl = "/liked-extension.zip";
  const crxUrl = "/liked-extension.crx";
  const edgeCanaryUrl =
    "https://play.google.com/store/apps/details?id=com.microsoft.emmx.canary";

  useEffect(() => {
    const p = detectPlatform();
    // Deferred: keeps the server-rendered "desktop" default through hydration
    // (no SSR/UA mismatch), then re-renders with the detected platform once.
    queueMicrotask(() => {
      setDetected(p);
      setPlatform(p);
    });
  }, []);

  function copyExtUrl() {
    navigator.clipboard?.writeText("chrome://extensions").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="max-w-lg w-full space-y-6 p-8"
        style={{
          background: "var(--surface-1)",
          borderRadius: "var(--r-xl)",
          border: "1px solid var(--border-1)",
          boxShadow: "var(--shadow-xl)",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 56,
              height: 56,
              margin: "0 auto 16px",
              borderRadius: 14,
              background: "var(--accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent-ink)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="4" />
              <line x1="21.17" y1="8" x2="12" y2="8" />
              <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
              <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
            </svg>
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 700,
              color: "var(--text-1)",
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            Install LIKED Chrome Extension
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-2)",
              marginTop: 8,
            }}
          >
            Save any URL to your LIKED library with one click.
          </p>
        </div>

        {/* Platform picker */}
        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {(["desktop", "android", "ios"] as Platform[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatform(p)}
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                border: `1px solid ${platform === p ? "var(--accent)" : "var(--border-1)"}`,
                background: platform === p ? "var(--accent)" : "var(--surface-3)",
                color: platform === p ? "var(--accent-ink)" : "var(--text-2)",
              }}
            >
              {PLATFORM_LABEL[p]}
              {p === detected ? " (this device)" : ""}
            </button>
          ))}
        </div>

        {/* ── DESKTOP (Windows / Mac / Linux) ─────────────────────────── */}
        {platform === "desktop" && (
          <>
            {webStoreUrl && (
              <a
                href={webStoreUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  width: "100%",
                  padding: "14px 0",
                  background: "var(--accent)",
                  color: "var(--accent-ink)",
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 700,
                  textDecoration: "none",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
                Add to Chrome
              </a>
            )}

            {!webStoreUrl && (
              <a
                href={zipUrl}
                download="liked-extension.zip"
                onClick={() => setDownloaded(true)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  width: "100%",
                  padding: "16px 0",
                  background: "var(--accent)",
                  color: "var(--accent-ink)",
                  borderRadius: 12,
                  fontSize: 16,
                  fontWeight: 700,
                  textDecoration: "none",
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
                  transition: "transform 0.1s ease",
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download Extension
              </a>
            )}

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                color: "var(--text-3)",
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              <div style={{ flex: 1, height: 1, background: "var(--border-1)" }} />
              {webStoreUrl ? "OR INSTALL MANUALLY" : "STEPS FOR WINDOWS CHROME"}
              <div style={{ flex: 1, height: 1, background: "var(--border-1)" }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <StepItem
                num={1}
                title="Download and unzip"
                description={
                  <>
                    {webStoreUrl ? (
                      <>
                        Click{" "}
                        <a
                          href={zipUrl}
                          download="liked-extension.zip"
                          onClick={() => setDownloaded(true)}
                          style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
                        >
                          Download Extension (ZIP)
                        </a>
                        , then{" "}
                      </>
                    ) : (
                      <>
                        {downloaded ? "✓ " : ""}The ZIP above saves to your
                        Downloads folder.{" "}
                      </>
                    )}
                    On <strong style={{ color: "var(--text-1)" }}>Windows</strong>,
                    right-click it →{" "}
                    <strong style={{ color: "var(--text-1)" }}>
                      &quot;Extract All…&quot;
                    </strong>
                    . On Mac, double-click it. Remember where you extracted it.
                  </>
                }
              />
              <StepItem
                num={2}
                title="Open the extensions page"
                description={
                  <>
                    In Chrome, open a new tab and go to{" "}
                    <code
                      style={{
                        padding: "2px 6px",
                        background: "var(--surface-3)",
                        borderRadius: 4,
                        fontSize: 12,
                        color: "var(--text-1)",
                      }}
                    >
                      chrome://extensions
                    </code>{" "}
                    <button
                      type="button"
                      onClick={copyExtUrl}
                      style={{
                        padding: "1px 8px",
                        marginLeft: 4,
                        fontSize: 11,
                        fontWeight: 600,
                        borderRadius: 6,
                        border: "1px solid var(--border-1)",
                        background: "var(--surface-3)",
                        color: copied ? "var(--accent)" : "var(--text-2)",
                        cursor: "pointer",
                      }}
                    >
                      {copied ? "Copied ✓" : "Copy"}
                    </button>
                    <br />
                    <span style={{ fontSize: 12, color: "var(--text-3)" }}>
                      (Web pages can&apos;t open chrome:// links — copy it into
                      the address bar.)
                    </span>
                  </>}
              />
              <StepItem
                num={3}
                title="Load in Chrome"
                description={
                  <>
                    Turn on{" "}
                    <strong style={{ color: "var(--text-1)" }}>
                      &quot;Developer mode&quot;
                    </strong>{" "}
                    (top-right toggle), click{" "}
                    <strong style={{ color: "var(--text-1)" }}>
                      &quot;Load unpacked&quot;
                    </strong>
                    , and select the folder you extracted — the one that
                    directly contains{" "}
                    <code
                      style={{
                        padding: "2px 6px",
                        background: "var(--surface-3)",
                        borderRadius: 4,
                        fontSize: 12,
                        color: "var(--text-1)",
                      }}
                    >
                      manifest.json
                    </code>
                    .
                  </>
                }
              />
              <StepItem
                num={4}
                title="Sign in"
                description={
                  <>
                    Click the LIKED icon{" "}
                    <ExtGlyph /> in your Chrome toolbar and press{" "}
                    <strong style={{ color: "var(--text-1)" }}>
                      &quot;Sign In&quot;
                    </strong>
                    . You&apos;ll be redirected to LIKED to authenticate —
                    that&apos;s it!
                  </>
                }
              />
            </div>
          </>
        )}

        {/* ── ANDROID ─────────────────────────────────────────────────── */}
        {platform === "android" && (
          <>
            <div
              style={{
                padding: "12px 14px",
                background: "var(--surface-3)",
                borderRadius: 10,
                border: "1px solid var(--border-1)",
                fontSize: 13,
                color: "var(--text-2)",
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: "var(--text-1)" }}>
                Chrome on Android doesn&apos;t support extensions
              </strong>{" "}
              — no version of it does. The working Android path is{" "}
              <strong style={{ color: "var(--text-1)" }}>
                Microsoft Edge Canary
              </strong>
              , which inherited Kiwi Browser&apos;s extension engine and can
              sideload the LIKED extension file.
            </div>

            <a
              href={crxUrl}
              download="liked-extension.crx"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                width: "100%",
                padding: "16px 0",
                background: "var(--accent)",
                color: "var(--accent-ink)",
                borderRadius: 12,
                fontSize: 16,
                fontWeight: 700,
                textDecoration: "none",
                border: "none",
                cursor: "pointer",
                boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Extension (.crx)
            </a>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <StepItem
                num={1}
                title="Install Microsoft Edge Canary"
                description={
                  <>
                    Get it from the{" "}
                    <a
                      href={edgeCanaryUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--accent)", fontWeight: 600, textDecoration: "none" }}
                    >
                      Play Store
                    </a>
                    . This is the beta browser that supports extensions on
                    Android.
                  </>
                }
              />
              <StepItem
                num={2}
                title="Download the .crx file"
                description={
                  <>
                    Tap{" "}
                    <strong style={{ color: "var(--text-1)" }}>
                      &quot;Download Extension (.crx)&quot;
                    </strong>{" "}
                    above in Edge Canary. If the browser warns about the file,
                    choose <strong style={{ color: "var(--text-1)" }}>Keep</strong>.
                  </>
                }
              />
              <StepItem
                num={3}
                title="Enable Developer options"
                description={
                  <>
                    In Edge Canary: <strong style={{ color: "var(--text-1)" }}>Settings</strong> →{" "}
                    <strong style={{ color: "var(--text-1)" }}>About Microsoft Edge</strong> → tap the
                    version number (e.g. &quot;Edge Canary 136.x&quot;){" "}
                    <strong style={{ color: "var(--text-1)" }}>5 times</strong> until
                    &quot;Developer options enabled&quot; appears.
                  </>
                }
              />
              <StepItem
                num={4}
                title="Install by crx"
                description={
                  <>
                    Back in <strong style={{ color: "var(--text-1)" }}>Settings</strong> →{" "}
                    <strong style={{ color: "var(--text-1)" }}>Developer options</strong> →{" "}
                    <strong style={{ color: "var(--text-1)" }}>
                      &quot;Extension install by crx&quot;
                    </strong>{" "}
                    → pick the downloaded{" "}
                    <code
                      style={{
                        padding: "2px 6px",
                        background: "var(--surface-3)",
                        borderRadius: 4,
                        fontSize: 12,
                        color: "var(--text-1)",
                      }}
                    >
                      liked-extension.crx
                    </code>
                    .
                  </>
                }
              />
              <StepItem
                num={5}
                title="Sign in to LIKED"
                description={
                  <>
                    Open the LIKED icon <ExtGlyph /> from Edge&apos;s extension
                    menu and press{" "}
                    <strong style={{ color: "var(--text-1)" }}>
                      &quot;Sign In&quot;
                    </strong>
                    . The LIKED site will hand your session to the extension
                    automatically.
                  </>
                }
              />
            </div>
          </>
        )}

        {/* ── iOS ─────────────────────────────────────────────────────── */}
        {platform === "ios" && (
          <div
            style={{
              padding: "12px 14px",
              background: "var(--surface-3)",
              borderRadius: 10,
              border: "1px solid var(--border-1)",
              fontSize: 13,
              color: "var(--text-2)",
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: "var(--text-1)" }}>
              Not available on iOS.
            </strong>{" "}
            No iPhone or iPad browser can install Chrome extensions. Open this
            page on a Windows, Mac, or Linux computer — or on Android via the
            Edge Canary steps.
          </div>
        )}

        {/* Help note */}
        <div
          style={{
            padding: "12px 14px",
            background: "var(--surface-3)",
            borderRadius: 10,
            border: "1px solid var(--border-1)",
            fontSize: 12,
            color: "var(--text-2)",
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "var(--text-1)" }}>Trouble?</strong>{" "}
          {platform === "desktop" ? (
            <>
              If &quot;Load unpacked&quot; is greyed out, make sure{" "}
              <strong style={{ color: "var(--text-1)" }}>Developer mode</strong>{" "}
              is turned on. If the extension doesn&apos;t appear after
              extracting, select the folder <em>containing</em> the files (not
              the ZIP itself).
            </>
          ) : platform === "android" ? (
            <>
              Edge Canary is a beta app — if an update breaks the extension,
              reinstall the .crx the same way. The extension ID never changes,
              so you won&apos;t have to sign in again.
            </>
          ) : (
            <>Use the desktop steps on a computer.</>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            paddingTop: 16,
            borderTop: "1px solid var(--border-1)",
          }}
        >
          <Link
            href="/feed"
            style={{
              fontSize: 13,
              color: "var(--text-3)",
              textDecoration: "none",
            }}
          >
            ← Back to feed
          </Link>
        </div>
      </div>
    </div>
  );
}

function ExtGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--accent)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ verticalAlign: "middle", display: "inline" }}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <line x1="21.17" y1="8" x2="12" y2="8" />
      <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
      <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
    </svg>
  );
}

function StepItem({
  num,
  title,
  description,
}: {
  num: number;
  title: string;
  description: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <div
        style={{
          width: 24,
          height: 24,
          borderRadius: "50%",
          background: "var(--accent)",
          color: "var(--accent-ink)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {num}
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-1)",
            marginBottom: 4,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-2)",
            lineHeight: 1.5,
          }}
        >
          {description}
        </div>
      </div>
    </div>
  );
}

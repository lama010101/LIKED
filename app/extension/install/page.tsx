"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Chrome Extension install page.
 *
 * Reached from the Profile modal → "Install Chrome Extension".
 *
 * Primary flow: one-click download of a pre-built ZIP, then 3 simple
 * steps (download → extract → load unpacked). No Node.js, no git
 * clone, no build required.
 *
 * If NEXT_PUBLIC_CHROME_WEBSTORE_URL is set, a "Add to Chrome" button
 * is shown as the primary CTA (one-click install from the Web Store).
 */
export default function ExtensionInstallPage() {
  const [downloaded, setDownloaded] = useState(false);

  const webStoreUrl = process.env.NEXT_PUBLIC_CHROME_WEBSTORE_URL;
  const zipUrl = "/liked-extension.zip";

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

        {/* Primary CTA: Chrome Web Store (if published) */}
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

        {/* Primary CTA: Download ZIP (always available) */}
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

        {/* Divider */}
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
          {webStoreUrl ? "OR DOWNLOAD ZIP" : "AFTER DOWNLOADING"}
          <div style={{ flex: 1, height: 1, background: "var(--border-1)" }} />
        </div>

        {/* Steps — only 3 simple steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {webStoreUrl && (
            <StepItem
              num={1}
              title="Download the ZIP"
              description={
                <>
                  Click{" "}
                  <strong style={{ color: "var(--text-1)" }}>
                    Download Extension
                  </strong>{" "}
                  above. Your browser will save{" "}
                  <code
                    style={{
                      padding: "2px 6px",
                      background: "var(--surface-3)",
                      borderRadius: 4,
                      fontSize: 12,
                      color: "var(--text-1)",
                    }}
                  >
                    liked-extension.zip
                  </code>{" "}
                  to your Downloads folder.
                </>
              }
            />
          )}
          <StepItem
            num={webStoreUrl ? 2 : 1}
            title="Unzip the file"
            description={
              <>
                {downloaded ? "✓ " : ""}
                Right-click the downloaded ZIP and choose{" "}
                <strong style={{ color: "var(--text-1)" }}>
                  &quot;Extract All…&quot;
                </strong>{" "}
                (Windows) or double-click it (Mac). Remember where you
                extracted it — you&apos;ll need this folder next.
              </>
            }
          />
          <StepItem
            num={webStoreUrl ? 3 : 2}
            title="Load in Chrome"
            description={
              <>
                Open{" "}
                <a
                  href="chrome://extensions"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent)", textDecoration: "none" }}
                >
                  chrome://extensions
                </a>
                , turn on{" "}
                <strong style={{ color: "var(--text-1)" }}>
                  &quot;Developer mode&quot;
                </strong>{" "}
                (top-right toggle), then click{" "}
                <strong style={{ color: "var(--text-1)" }}>
                  &quot;Load unpacked&quot;
                </strong>{" "}
                and select the folder you just extracted.
              </>
            }
          />
          <StepItem
            num={webStoreUrl ? 4 : 3}
            title="Sign in"
            description={
              <>
                Click the LIKED icon{" "}
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
                </svg>{" "}
                in your Chrome toolbar and press{" "}
                <strong style={{ color: "var(--text-1)" }}>
                  &quot;Sign In&quot;
                </strong>
                . You&apos;ll be redirected to LIKED to authenticate —
                that&apos;s it!
              </>
            }
          />
        </div>

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
          <strong style={{ color: "var(--text-1)" }}>Trouble?</strong> If
          &quot;Load unpacked&quot; is greyed out, make sure{" "}
          <strong style={{ color: "var(--text-1)" }}>
            Developer mode
          </strong>{" "}
          is turned on. If the extension doesn&apos;t appear after
          extracting, make sure you select the folder{" "}
          <em>containing</em> the files (not the ZIP itself).
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

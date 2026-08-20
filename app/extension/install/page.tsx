"use client";

import { useState } from "react";
import Link from "next/link";

/**
 * Chrome Extension install page.
 *
 * Reached from the Profile modal → "Install Chrome Extension".
 * Shows step-by-step instructions for loading the unpacked extension
 * and a link to the Chrome Web Store listing when published.
 */
export default function ExtensionInstallPage() {
  const [copied, setCopied] = useState(false);

  const webStoreUrl = process.env.NEXT_PUBLIC_CHROME_WEBSTORE_URL;
  const githubRepoUrl = "https://github.com/lama010101/LIKED";

  const handleCopyRepo = () => {
    navigator.clipboard.writeText(githubRepoUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

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

        {/* Chrome Web Store button (if published) */}
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
              padding: "12px 0",
              background: "var(--accent)",
              color: "var(--accent-ink)",
              borderRadius: 12,
              fontSize: 15,
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
          {webStoreUrl ? "OR LOAD UNPACKED" : "MANUAL INSTALL"}
          <div style={{ flex: 1, height: 1, background: "var(--border-1)" }} />
        </div>

        {/* Steps */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <StepItem
            num={1}
            title="Download the extension"
            description={
              <>
                Clone or download the{" "}
                <a
                  href={githubRepoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--accent)", textDecoration: "none" }}
                >
                  LIKED repo
                </a>{" "}
                and build the extension:
                <br />
                <code
                  style={{
                    display: "inline-block",
                    marginTop: 6,
                    padding: "4px 8px",
                    background: "var(--surface-3)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "var(--text-1)",
                  }}
                >
                  npm run build:extension
                </code>
              </>
            }
          />
          <StepItem
            num={2}
            title="Open Chrome extensions page"
            description={
              <>
                Open{" "}
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
                in a new tab.
              </>
            }
          />
          <StepItem
            num={3}
            title="Enable Developer mode"
            description="Toggle the 'Developer mode' switch in the top-right corner."
          />
          <StepItem
            num={4}
            title="Load unpacked"
            description={
              <>
                Click &quot;Load unpacked&quot; and select the{" "}
                <code
                  style={{
                    padding: "2px 6px",
                    background: "var(--surface-3)",
                    borderRadius: 4,
                    fontSize: 12,
                    color: "var(--text-1)",
                  }}
                >
                  extension/dist
                </code>{" "}
                folder from the repo.
              </>
            }
          />
          <StepItem
            num={5}
            title="Sign in"
            description={
              <>
                Click the LIKED icon in your toolbar and press &quot;Sign
                In&quot;. You&apos;ll be redirected to the LIKED web app to
                authenticate.
              </>
            }
          />
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
          <button
            onClick={handleCopyRepo}
            style={{
              padding: "6px 12px",
              background: "var(--surface-3)",
              border: "1px solid var(--border-1)",
              borderRadius: 8,
              color: "var(--text-2)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {copied ? "✓ Copied" : "Copy repo URL"}
          </button>
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

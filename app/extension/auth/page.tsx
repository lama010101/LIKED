"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Auth relay page for the LIKED Chrome extension.
 *
 * Flow (docs/06 §19, docs/05 §2.5):
 *   1. User clicks "Sign In" in the extension popup → opens this page in a tab.
 *   2. If unauthenticated → redirect to /login?redirect=/extension/auth.
 *   3. If authenticated → read access_token from the browser Supabase session
 *      and relay it to the extension via chrome.runtime.sendMessage with the
 *      extension ID configured in NEXT_PUBLIC_EXTENSION_ID.
 *   4. Extension service worker stores the session in chrome.storage.local.
 *   5. Show "Connected — you can close this tab" and close after a delay.
 *
 * The extension must list this origin in manifest.json's
 * `externally_connectable.matches` for the message to be delivered.
 */
export default function ExtensionAuthRelayPage() {
  const [status, setStatus] = useState<"loading" | "sending" | "sent" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID;
      const hasChromeRuntime = typeof chrome !== "undefined" && !!chrome?.runtime;

      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();

      if (cancelled) return;

      if (!session?.access_token) {
        // Not signed in → bounce to login with redirect back here.
        const redirect = encodeURIComponent("/extension/auth");
        window.location.href = `/login?redirect=${redirect}`;
        return;
      }

      if (!extensionId) {
        setStatus("error");
        setErrorMsg("NEXT_PUBLIC_EXTENSION_ID is not set on the server. Set it to the extension's ID (from chrome://extensions) and rebuild the web app.");
        return;
      }

      if (!hasChromeRuntime) {
        // Not running inside an extension-controlled tab context — still try
        // sendMessage; in some browsers chrome.runtime exists only when the
        // tab was opened by the extension. Surface a clear error otherwise.
        setStatus("error");
        setErrorMsg("chrome.runtime is unavailable. Open this page from the LIKED extension's Sign In button.");
        return;
      }

      setStatus("sending");
      try {
        const user = session.user;
        const payload = {
          type: "LIKED_SESSION",
          accessToken: session.access_token,
          refreshToken: session.refresh_token ?? null,
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
          supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? null,
          user: {
            id: user.id,
            email: user.email ?? null,
            displayName: (user.user_metadata as { display_name?: string } | null)?.display_name ?? null,
          },
          expiresAt: session.expires_at ?? null,
        };
        chrome.runtime.sendMessage(extensionId, payload, (response) => {
          if (cancelled) return;
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            setStatus("error");
            setErrorMsg(`Failed to relay session: ${lastError.message}`);
            return;
          }
          setStatus("sent");
          // Auto-close after a short delay so the user sees the confirmation.
          setTimeout(() => {
            if (!cancelled) window.close();
          }, 1500);
          void response;
        });
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(err instanceof Error ? err.message : "Failed to relay session.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: "var(--bg)" }}
    >
      <div
        className="max-w-md w-full space-y-4 p-8 text-center"
        style={{
          background: "var(--surface-1)",
          borderRadius: "var(--r-xl)",
          border: "1px solid var(--border-1)",
          boxShadow: "var(--shadow-xl)",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", margin: 0 }}>
          LIKED Extension
        </h1>

        {status === "loading" && (
          <p style={{ color: "var(--text-2)", fontSize: 14 }}>Checking your session…</p>
        )}

        {status === "sending" && (
          <p style={{ color: "var(--text-2)", fontSize: 14 }}>Connecting to extension…</p>
        )}

        {status === "sent" && (
          <>
            <p style={{ color: "var(--text-1)", fontSize: 14, fontWeight: 600 }}>
              ✓ Connected — you can close this tab.
            </p>
            <p style={{ color: "var(--text-3)", fontSize: 12 }}>Open the LIKED extension popup to save pages.</p>
          </>
        )}

        {status === "error" && (
          <div style={{ color: "var(--text-1)", fontSize: 13, whiteSpace: "pre-wrap" }}>
            <p style={{ fontWeight: 600, color: "var(--danger, #ef4444)" }}>Could not connect</p>
            <p style={{ marginTop: 8 }}>{errorMsg}</p>
          </div>
        )}
      </div>
    </div>
  );
}

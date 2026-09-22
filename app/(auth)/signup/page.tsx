"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Google-only signup (PRD §41.2). Account creation happens inside the
 * Google OAuth grant (profile upserted in /callback); the same grant
 * carries YouTube readonly + offline refresh scopes.
 */
export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleSignup = async () => {
    setLoading(true);
    setError(null);

    const { error } = await supabaseBrowser.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/callback`,
        scopes: "https://www.googleapis.com/auth/youtube.readonly",
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
      <div className="max-w-md w-full space-y-6 p-8" style={{ background: "var(--surface-1)", borderRadius: "var(--r-xl)", border: "1px solid var(--border-1)", boxShadow: "var(--shadow-xl)" }}>
        <div className="text-center space-y-2">
          <h1 className="font-serif text-3xl font-black" style={{ color: "var(--text-1)", letterSpacing: "-0.03em" }}>
            liked<span style={{ color: "var(--accent)" }}>.</span>
          </h1>
          <p style={{ color: "var(--text-2)", fontSize: "var(--text-sm)" }}>Create your account</p>
        </div>

        {error && (
          <div id="form-error" role="alert" aria-live="polite" className="p-3 text-sm font-medium" style={{ background: "rgba(248,113,113,0.12)", color: "var(--red)", borderRadius: "var(--r-md)", border: "1px solid rgba(248,113,113,0.25)" }}>{error}</div>
        )}

        <button
          onClick={handleGoogleSignup}
          disabled={loading}
          className="w-full py-2.5 px-4 text-sm font-semibold flex items-center justify-center gap-2"
          style={{ background: "var(--surface-2)", color: "var(--text-1)", borderRadius: "var(--r-md)", border: "1px solid var(--border-1)", cursor: "pointer", transition: "background 150ms ease" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--surface-3)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--surface-2)"; }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {loading ? "Redirecting..." : "Continue with Google"}
        </button>

        <p className="text-center text-xs" style={{ color: "var(--text-3)", lineHeight: 1.6 }}>
          By signing up, you agree to our{" "}
          <a href="/terms" className="font-semibold hover:underline" style={{ color: "var(--accent-light)" }}>
            Terms of Service
          </a>{" "}
          and{" "}
          <a href="/privacy" className="font-semibold hover:underline" style={{ color: "var(--accent-light)" }}>
            Privacy Policy
          </a>
          .
        </p>

        <p className="text-center text-sm" style={{ color: "var(--text-2)" }}>
          Already have an account?{" "}
          <a href="/login" className="font-semibold hover:underline" style={{ color: "var(--accent-light)" }}>
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}

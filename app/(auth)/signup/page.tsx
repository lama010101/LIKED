"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@/lib/types/database";

const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function getEmailPrefix(email: string): string {
  return email.split("@")[0] || "user";
}

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Sign up with Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError("Failed to create user");
        setLoading(false);
        return;
      }

      router.push("/feed");
      router.refresh();
    } catch {
      setError("Sign up failed. Please try again.");
      setLoading(false);
    }
  };

  const handleGoogleSignup = async () => {
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/callback`,
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
          <div className="p-3 text-sm font-medium" style={{ background: "rgba(248,113,113,0.12)", color: "var(--red)", borderRadius: "var(--r-md)", border: "1px solid rgba(248,113,113,0.25)" }}>{error}</div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text-1)" }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm"
              style={{ background: "var(--c-input-bg, var(--surface-2))", border: "1px solid var(--c-input-border, var(--border-1))", borderRadius: "var(--r-md)", color: "var(--text-1)", outline: "none", transition: "border-color 150ms ease, box-shadow 150ms ease" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,252,0.15)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--c-input-border, var(--border-1))"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text-1)" }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-3 py-2.5 text-sm"
                style={{ background: "var(--c-input-bg, var(--surface-2))", border: "1px solid var(--c-input-border, var(--border-1))", borderRadius: "var(--r-md)", color: "var(--text-1)", outline: "none", transition: "border-color 150ms ease, box-shadow 150ms ease", paddingRight: 40 }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,252,0.15)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--c-input-border, var(--border-1))"; e.currentTarget.style.boxShadow = "none"; }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 4,
                  color: "var(--text-3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
            {password && password.length < 6 && (
              <p style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>
                Password must be at least 6 characters
              </p>
            )}
          </div>

          <div>
            <label htmlFor="displayName" className="block text-sm font-semibold mb-1.5" style={{ color: "var(--text-1)" }}>
              Display Name{" "}<span style={{ color: "var(--text-3)" }}>(optional)</span>
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={getEmailPrefix(email) || "Your name"}
              className="w-full px-3 py-2.5 text-sm"
              style={{ background: "var(--c-input-bg, var(--surface-2))", border: "1px solid var(--c-input-border, var(--border-1))", borderRadius: "var(--r-md)", color: "var(--text-1)", outline: "none", transition: "border-color 150ms ease, box-shadow 150ms ease" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,92,252,0.15)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--c-input-border, var(--border-1))"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password || password.length < 6}
            className="w-full py-2.5 px-4 text-sm font-bold"
            style={{ background: "var(--accent)", color: "var(--accent-ink)", borderRadius: "var(--r-md)", border: "none", cursor: "pointer", transition: "opacity 150ms ease, transform 150ms ease", opacity: loading || !email || !password || password.length < 6 ? 0.5 : 1 }}
            onMouseEnter={(e) => { if (!loading && email && password) e.currentTarget.style.opacity = "0.9"; }}
            onMouseLeave={(e) => { if (!loading) e.currentTarget.style.opacity = "1"; }}
            onMouseDown={(e) => { if (!loading && email && password) e.currentTarget.style.transform = "scale(0.98)"; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
          >
            {loading ? "Creating account..." : "Sign Up"}
          </button>
        </form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full" style={{ borderTop: "1px solid var(--border-1)" }} />
          </div>
          <div className="relative flex justify-center text-xs font-semibold uppercase tracking-wider">
            <span className="px-2" style={{ background: "var(--surface-1)", color: "var(--text-3)" }}>Or</span>
          </div>
        </div>

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
          Continue with Google
        </button>

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

# NEEDS-SPEC N1 — Auth method change to Google OAuth (§41.2)

**Status:** proposal — awaiting decision. No implementation has been done.

## The decision

How to implement the already-committed auth pivot: replace the email/password
signup+login flow with Google-OAuth-only, where the signup OAuth grant also
carries the YouTube scopes (single unified grant, not two flows).

## Hard constraints already in spec (do not re-litigate)

- PRD §41.2 is **AUTHORITATIVE** and *supersedes* §23: Google OAuth is the
  **only** signup/login method — the change is a **replacement, not additive**.
- The existing `youtube_connections` OAuth flow (token-crypto, Option B)
  becomes the *same* grant as signup — YouTube readonly + login scopes are
  requested **at signup time**.
- Existing email/password accounts (`laurent.martenot`, `a@a.com`, others):
  **no migration path required** — may be kept as-is or disposed of at
  implementation time (§41.2, §41.5).
- §41.4 onboarding step 1 ("Signup = Google OAuth") depends on this landing.

## Options

### A — Big-bang replacement
Remove `app/(auth)/signup` and `app/(auth)/login` email/password forms; add a
single "Continue with Google" button requesting YouTube scopes; unify with
`youtube_connections` token persistence. **Effort: M.** Tradeoff: most faithful
to spec (non-additive); but existing email/password sessions are stranded
(spec permits), and e2e/dev login helpers (`e2e/.auth`, playwright login
fixtures) must be reworked to OAuth test accounts or a test-only backdoor —
that is real, non-trivial work hiding inside "M".

### B — Phased: add Google OAuth first, cut email/password second
Ship the unified Google grant alongside the current flow, then delete
email/password once e2e/dev flows are migrated. **Effort: M** (two smaller
changes). Tradeoff: safer rollout and keeps dev/e2e login working during
transition; **violates the "not additive" letter of §41.2 for the interim
period** — needs an explicit sunset commit, not an open-ended flag.

### C — Defer; keep email/password until more of §41 lands
**Effort: S** (no work). Tradeoff: blocks §41.4 onboarding (its step 1 is
Google OAuth) and leaves a spec-vs-code divergence open indefinitely; the
YouTube-scope unification also stays undone, so new users still need a second
OAuth step later.

## Recommendation

**Option A**, with the e2e/dev-login rework called out explicitly as part of
the task (Google OAuth test account or Supabase auth stub). The spec's
"not additive" language is unambiguous, existing accounts are declared
disposable, and a flag-based middle state is exactly the kind of dual-logic
this project's rules forbid. If dev-flow continuity is judged critical, take
Option B — but only with a committed removal date/task for the legacy path.

*This is a recommendation, not a decision.*

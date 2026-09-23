# SPEC — Legacy email-only users (auth identity audit)

**Status:** read-only evidence + options. No auth changes.

## Live evidence (auth.identities, queried via service role — COUNT ONLY,
no emails or names recorded here)

- `auth.users` total: **8**
- Provider histogram:

| identity set | users |
|---|---|
| `email` only | **6** |
| `google` only | 1 |
| `email` + `google` | 1 |

- The single `email+google` row proves identity linking has occurred at
  least once in this project (a user holds both providers on one account).

## Auto-linking behavior — evidence

Supabase links a Google sign-in to an existing email user automatically
**when the Google email is verified and matches the existing account's
email** (Supabase GoTrue "automatic linking" — default-on for
verified-email OAuth providers). Observed data is consistent: one user
carries both identities; the six email-only users have never completed a
matching Google sign-in (otherwise they would show `email+google`).

Caveat: project auth config was not dumpable in this read; the claim is
inferred from GoTrue defaults + the observed linked account.

## Consequence for the 6 email-only users

- No breakage today — password login works; `users` rows/edges intact.
- If they later use "Continue with Google" on the same email → Supabase
  auto-links (verified email match) → same account, no data loss.
- If they Google-sign-in with a *different* email → a NEW user row is
  created → their library looks empty (edges are per-user). This is the
  real footgun: "I logged in and everything is gone" support case.

## Options

1. **Do nothing** (recommended for now): linking is automatic on matching
   verified email; email users are a small, known set.
2. **Documented account-linking affordance**: add "Connect Google" inside
   settings using `supabase.auth.linkIdentity()` — makes linking
   explicit instead of relying on auto-link. Effort: S.
3. **Email prompt/banner** nudging email-only users to link Google
   (only worthwhile if YouTube import becomes email-login-accessible —
   currently YouTube connect is itself a Google OAuth flow).

## Recommendation

Option 1 now; Option 2 as part of a future settings/account surface.
If Option 2 ships: the link flow is one `linkIdentity` call — no data
migration is needed because linking preserves the user id (edges/causes
attach to `auth.users.id`, which stays the same).

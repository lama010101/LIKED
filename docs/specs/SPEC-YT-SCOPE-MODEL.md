# SPEC — YouTube OAuth scope model (G4 scope-mismatch)

**Status:** spec proposal — the COMPLETE-APP-002 A11 guard is shipped
(user-facing message on 403/missing stored grant); this spec decides the
consent model. No code changes here.

## Current state evidence

- **Signup grant** (`login/page.tsx`) requests `youtube.readonly`.
- **`/api/youtube/connect`** requests full `youtube` scope (needed by
  Unlike / Unsubscribe DELETE handlers on `/youtube`).
- Consequence: a user who granted only readonly at signup sees
  working-looking buttons that YouTube will 403; A11 now shows
  "This action needs extra YouTube permission — reconnect YouTube to
  enable it" (stored-scope check + 403 reason detection; no new consent
  flow was added).
- `youtube_connections.scopes text[]` stores the granted set.

## The decision

One-grant full scope vs two-tier escalation.

## Options

### A — One grant, full scope (simplest)

- Signup requests full `youtube` scope. One consent screen, all features
  work. Cost: heavier consent prompt at first login may hurt conversion;
  "LIKED wants to manage your YouTube account" reads scarier than
  readonly.

### B — Two-tier (recommended)

- Signup stays `youtube.readonly` (import-only grant — matches the
  onboarding import use-case).
- On Unlike/Unsubscribe when stored grant lacks write scope (the A11
  hook already detects this), trigger a re-consent with the `youtube`
  scope (incremental OAuth) — "Reconnect YouTube" button on the error
  toast/page.
- Cost: an extra consent click at first write — but only write-users
  pay it. Matches least-privilege.

## Recommendation

**B** — keep readonly at signup, escalate on write. A11 already detects
the missing scope and tells the user to reconnect; the remaining work
is wiring that affordance to a real re-consent round-trip.

## Open questions for owner

- Whether escalation asks for `youtube` wholesale or the narrower
  `youtube.force-ssl` scope (covers like/unlike/subscribe write calls —
  recommend evaluating the narrower scope first).

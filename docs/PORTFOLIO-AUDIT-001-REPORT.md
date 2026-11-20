# PORTFOLIO-AUDIT-001 — Read-only audit: "friends recommend things to watch" golden path

**Project:** LIKED
**Task ID:** PORTFOLIO-AUDIT-001
**Task Title:** Read-only audit of the "friends recommend things to watch" golden path
**Date:** 2026-11-20
**Scope:** Read-only. No code, schema, or config changed. Only file created: this report.
**Method:** Production deployment inspected via Vercel CLI; code audited at `origin/main` (`8cd0c84`); live golden-path executed against production (`https://liked-zeta.vercel.app`) with Playwright/Chromium at 390px and 1280px using password-grant sessions for `laurent.martenot@gmail.com` (sender) and `a@a.com` (receiver). All writes (friend invite, 3 cards, 2 shares, 2 ratings) were performed through the real UI/server actions; results verified in the production database.

---

## A. Deployment

| Check | Result | Evidence |
|---|---|---|
| Production URL | `https://liked-zeta.vercel.app` | Vercel alias for project `liked` (`prj_fExbBp51DLXzWgnjXMtGXciznIKI`, team `lolos-projects-dc7e07be`) |
| Last deployed commit | `8cd0c847556e06ada9adbe42afb8ad63d0e4a9e5` ("Merge branch 'devin/1791704977-flow-uix-switch' (PR #32)") | `vercel inspect dpl_2vWd5ZWdSRAzZvm4FhrBH8qtJXei --json`; deployment status **Ready**, created 2026-10-11T09:49:47Z, ref `main` |
| Matches `main` `8cd0c84`? | **YES** | After `git fetch`, `8cd0c84` = `origin/main` HEAD |
| Google OAuth consent screen mode (Testing/Production) | **UNVERIFIED** | Requires Google Cloud Console access; not reachable from repo or Vercel env |
| Can a brand-new Google account sign in? | **UNVERIFIED** | Requires a fresh Google account and interactive OAuth; cannot be automated. Code path is standard `signInWithOAuth` (see below) |
| Auth methods on `/login` | **Google OAuth only** — single "Continue with Google" button; no email/password | `app/(auth)/login/page.tsx:29-30` (`signInWithOAuth({provider:"google", scopes:"…/auth/youtube.readonly", queryParams:{access_type:"offline",prompt:"consent"}})`), `:92-130` (button) |
| Auth methods on `/signup` | **Google OAuth only** — single "Continue with Google" button | `app/(auth)/signup/page.tsx:19-20`, `:51-66` |

Note: sign-in in the golden path was performed by injecting a Supabase session cookie (the documented test method); the Google OAuth UI itself was not clicked through.

---

## B. Golden-path results (step × surface × viewport)

Legend: **PASS** / **FAIL** / **PARTIAL**. `/flow` is a separate mock UI (Zustand + IndexedDB + `flow/lib/mock.ts` seed data — "Deterministic seeded mock data. No network calls"), not connected to the LIKED database path.

| # | Step | /feed · 390px | /feed · 1280px | /flow · 390px | /flow · 1280px |
|---|---|---|---|---|---|
| 1 | Sign in | PASS — session loads `/feed` authenticated | PASS | PASS — `/flow` renders behind auth gate | PASS |
| 2a | Add card from YouTube URL | PASS — `youtube.com/watch?v=dQw4w9WgXcQ` created node `f86b9d2a` with real title "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)" + uploaded thumbnail | PASS — AddSheet opens with Card/YouTube/Folder modes and URL/title/note fields (verified live; IMDb add completed on desktop) | FAIL — no URL-add feature; mock generator only | FAIL — same |
| 2b | Add card from IMDb or Netflix URL | PASS — Netflix `watch/70143836` → node `c8c0694c`, title "Watch Breaking Bad \| Netflix" + thumbnail; IMDb `title/tt0133093` → node `714b1d59`, title fell back to raw URL, no thumbnail | PASS — same code path; IMDb card `714b1d59` created on desktop run | FAIL | FAIL |
| 3 | Share card to other account | PASS — ShareSheet → friend `a` → `share_node` RPC; DB shows `received` edge + `share_received` notification for `a@a.com` | PASS — same, YouTube card `f86b9d2a` | FAIL — no share-to-user feature | FAIL |
| 4 | Receiver sees it (Received filter), sender shown | PASS — `?friend=<laurent>` and default `/feed` both list both cards with `laurent.martenot` sender attribution (`CardItem.tsx:95-98`). No literal "Received" filter exists; friend filter is the mechanism | PASS | FAIL — feed shows only synthetic friends/cards | FAIL |
| 5 | Receiver rates it | **PARTIAL** — rating persisted (`ratings.score=91.0` on Netflix card, `61.0` on YouTube card), but **feed card clicks do not navigate for `a@a.com`**; card page reachable only via notification link or direct URL | **PARTIAL** — same caveat; slider + write verified | FAIL — no rating feature | FAIL |
| 6 | Receiver sees a notification | PASS — two `share_received` notifications (2026-11-20 12:38) + unread badge 8→9 | PASS | FAIL — no notifications | FAIL |

**Broken mobile steps:** `/feed` = **1** impaired step (step 5, PARTIAL — rating works but requires notification-link detour because card clicks are dead for this account). `/flow` = **6** failed steps (everything except the auth gate). → **`/feed` has fewer broken mobile steps.**

### Console errors / failed network requests observed (production)

- `Content-Security-Policy` `img-src` blocks `lh3.googleusercontent.com` → **Google avatars fail to load** for all users (console error + `requestfailed :: csp`, repeated on every page).
- CSP blocks `wss://lzkzfqshnjvlzosnntfx.supabase.co/realtime/v1/websocket` → **Supabase Realtime cannot connect** (console error on every authed page).
- `pageerror`: `Minified React error #418` (hydration text mismatch) on `a@a.com`'s `/feed` and `/notifications` loads — correlates with dead card-link clicks on that account (sender account does not show it; cause UNVERIFIED — likely data-dependent SSR/client text mismatch).
- `net::ERR_ABORTED` on `?_rsc=` prefetches and `youtube.com/embed/*` — normal Next.js navigation-abort noise plus YouTube iframe embed aborts.

---

## C. Existence checks

| Question | Answer | Evidence |
|---|---|---|
| Can a share carry a note or message to the recipient? | **NO** | `ShareSheet.tsx` renders only a permission `<select>` (`:94-99`), "All friends" + per-friend `<input type=checkbox>` (`:108-134`), group checkboxes, and snapshot note; no text field. `shareNodeAction` calls `rpc("share_node", {p_node_id, p_permission, p_target_user_ids, p_all_friends})` — no note param (`app/lib/actions/mvp2.ts:276-279`). `125_share_rpcs.sql` notification payload = `{node_id, node_title, sender_id, permission}` only. |
| Is there any watched / want-to-watch / seen state? | **NO** | `git grep -rniE "want.to.watch\|watched\|seen_state\|watch_status\|is_watched"` across `supabase/migrations`, `app/`, `lib/` → **zero hits** (excluding `_archive`). Ratings (`ratings.score` 0–100) are the only per-user state. |
| What does `extract-node-metadata` return for IMDb / Netflix URLs? | See table below | `supabase/functions/extract-node-metadata/index.ts:153-164` (`buildDefaults` on fetch fail/non-HTML → `title=url`; title = `ogTitle ?? twitterTitle ?? meta.title ?? url`) |
| Is there an invite link or flow for a person with no account? | **Email invite only — NO link flow** | `FriendsView.tsx:44-50` email input → `inviteFriendAction`; `112_f7_write_rpcs.sql` `invite_friend(p_email)` looks up `auth.users` by email, inserts `friend_invites` (pending if unregistered); `113_backfill_pending_friend_invites.sql` links pending invites on signup. `git grep` for invite link/token/URL → zero hits. |
| What does a brand-new user see on first login? | **UNVERIFIED (runtime)** — code evidence: no active onboarding UI | `app/lib/actions/onboarding.ts` has state RPCs, but `OnboardingRunner` exists only under `_archive/` — no onboarding component in the active route tree. Feed empty state text exists ("Nothing here yet. Tap + to save your first card."). No fresh account was available to observe first login. |

### `extract-node-metadata` live probe results (production edge function, anonymous)

| URL probed | title | thumbnail_key | suggested_tags | Notes |
|---|---|---|---|---|
| `youtube.com/watch?v=dQw4w9WgXcQ` (×4 probes) | the URL itself | null | `[]` | non-HTML/failed parse path → `buildDefaults` |
| `youtu.be/dQw4w9WgXcQ` | the URL itself | null | `[]` | same |
| `imdb.com/title/tt0111161/` | `""` (empty) | null | `["imdb","title","tt0111161"]` | URL-derived tags only; empty `og_data` |
| `imdb.com/title/tt0133093/` | `""` | null | `["imdb","title","tt0133093"]` | same |
| `imdb.com/title/tt0468569/` | `""` | null | `["imdb","title","tt0468569"]` | same |
| `netflix.com/title/60025720` | the URL itself | null | `[]` | `/title/` variant fails |
| `netflix.com/watch/70143836` | `"Watch Breaking Bad \| Netflix"` | null in response* | `["netflix","post","twitter","watch","breaking","bad","terminally","ill"]` | real OG data; `og_data` incl. `og_image` |
| `netflix.com/watch/80057281` | `"Watch Stranger Things \| Netflix Official Site"` | null in response* | `["netflix","post","twitter","watch","stranger","things","official","site"]` | same |

\* In the real app flow (`createNodeAction` passes the user's `accessToken`), the `og_image` **was** fetched and uploaded — DB shows `thumbnail_key` set for the Netflix card. For YouTube, anonymous probes consistently returned title=URL, yet the in-app add produced the real video title + thumbnail — the function's YouTube result is **intermittent/flaky**, not deterministic.

**In-app card-creation outcome (verified in DB):**
- YouTube `dQw4w9WgXcQ` → title "Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)", thumbnail uploaded, `node_type=link`.
- Netflix `watch/70143836` → title "Watch Breaking Bad | Netflix", thumbnail uploaded.
- IMDb `title/tt0133093` → title = raw URL `https://www.imdb.com/title/tt0133093/` (empty extracted title → `lib/db/nodes.ts:129` fallback), **no thumbnail**, tags = URL-derived (`imdb`,`title`,`tt0133093`).

---

## D. `/feed` vs `/flow` — broken mobile steps

| Surface | Broken/impaired mobile steps | Count |
|---|---|---|
| `/feed` | Step 5 PARTIAL (rating writes work; card unreachable from feed grid for `a@a.com` — notification link required) | **1** |
| `/flow` | Steps 2a, 2b, 3, 4, 5, 6 all FAIL — deterministic mock data (Maya/Jon/Priya, "Flow Agent", credits), no LIKED backend wiring | **6** |

**`/feed` has fewer broken mobile steps (1 vs 6).**

---

## E. UI-reachable routes returning error or blank page

Authenticated probe of every UI-linked route (laurent session, production):

| Route | Result |
|---|---|
| `/feed`, `/flow`, `/card/[id]`, `/friends`, `/me`, `/notifications`, `/organize`, `/trash`, `/youtube`, `/extension/install`, `/proto` | **200 with content** — no error/blank page observed |
| `/card/<random-uuid>` (no access), `/folders/<random-uuid>`, `/organize/<random-batchId>` | Graceful styled 404 ("Page not found / Back to feed") — not a crash |
| `/social` | 404 — **not linked from any UI element** (exists only in `proxy.ts:43` protected-route list; no `app/(app)/social/page.tsx`) |
| `/proto/<name>` | 404 for names outside the `PROTOTYPES` whitelist (by design); `/proto` index itself is **not linked from the app UI** |
| Unauthenticated hits to protected routes | 307 → `/login` (expected) |

**No UI-reachable route produced an error page or blank page during testing.** Routes not exercised by actual clicks (e.g., every folder tile target) are covered by the same page/component patterns; deep per-folder runtime states are **UNVERIFIED** beyond the probes above.

---

## F. Severity list

**P0 — reviewer cannot complete the golden path:** *None found.* The full path was completed end-to-end on `/feed` (cards created → shared → received with sender attribution → rated → notified), verified in DB. One judgment call: the dead card-click for `a@a.com` (below) nearly blocks step 5 through the obvious UI route; an alternate path via the notification link exists, so it is classified P1 rather than P0.

**P1:**
1. **Feed card clicks do not navigate for `a@a.com`** — every `a.card-link` click (own + received cards, mobile + desktop, real mouse + synthetic dispatch) leaves the URL on `/feed`; `defaultPrevented=true` observed. Sender account unaffected. Correlated with React hydration error #418 on that account's feed. Receiver must use the notification link or direct URL to reach `/card/[id]` and rate. *Scope beyond the two test accounts UNVERIFIED.*
2. **`extract-node-metadata` unreliable for the audited URL types** — YouTube intermittently returns title=URL/no thumbnail (4/4 anonymous probes failed; one in-app call succeeded); IMDb always returns empty title + URL-derived tags + no thumbnail (card shows raw URL as title); Netflix works only on `/watch/` variant (`/title/` fails).
3. **Google avatars broken in production** — CSP `img-src` omits `lh3.googleusercontent.com`; every page logs CSP violations and avatars never render.
4. **Supabase Realtime blocked by CSP** — `wss://…supabase.co/realtime` violates `connect-src`; live share/notification push cannot work (polling/`router.refresh()` paths still function — notifications did arrive).

**P2:**
5. Share carries **no note/message** to the recipient (schema + UI confirmed absent).
6. **No watched / want-to-watch / seen state** anywhere in schema or UI.
7. **No literal "Received" filter** — receiver discovery relies on the friend filter (`?friend=<id>`) or default feed; sender attribution renders only in feed cards (`CardItem.tsx:95-98`), not observed on the card detail page.
8. Notification items show the sender as a **truncated UUID** (`5355c879-a734-40be-9699- shared a card with you`), not a display name.
9. `/social` returns 404 (unlinked dead entry in proxy list); `/proto` pages unlinked from app UI.
10. New shared nodes get `node_type=link` even for YouTube URLs (video typing only via the YouTube import path).

---

## G. UNVERIFIED items

| Item | Why unverifiable |
|---|---|
| Google OAuth consent screen mode (Testing vs Production) | Requires Google Cloud Console; not in repo/Vercel env |
| Brand-new Google account can sign in | Requires interactive OAuth with a fresh Google account; automation used session-cookie injection instead |
| First-login experience for a brand-new user | No fresh account available; active UI contains no onboarding runner (only `_archive/` copy) — empty states inferred from code, not observed |
| Whether dead card-clicks affect accounts other than `a@a.com` | Only two accounts available; laurent unaffected, a@a.com affected — root cause (likely hydration mismatch) not isolated |
| Sender attribution on `/card/[id]` detail page | Captured card-page text showed no sender line, but full page not exhaustively checked |
| `/flow` parity with any real backend | Confirmed mock-only by code (`flow/lib/mock.ts`, `flow/store.ts`); no live-data mode exists to test |

---

## H. Key file evidence index

- Auth (Google-only): `app/(auth)/login/page.tsx:29-30,92-130`; `app/(auth)/signup/page.tsx:19-20,51-66`
- Route protection: `proxy.ts:43`; `app/(app)/layout.tsx` (`getSessionUser` → `/login`)
- Add card: `app/(app)/_components/AddSheet.tsx:174-184` (Modal + Card/YouTube/Folder seg + URL/title/note fields); `app/lib/actions/createNode.ts` (metadata merge); `lib/db/nodes.ts:122-143` (title fallback → `create_node_with_metadata` RPC)
- Share: `app/(app)/_components/ShareSheet.tsx:27,56,94-134`; `app/lib/actions/mvp2.ts:276-279`; `supabase/migrations/125_share_rpcs.sql` (cause + sent/received edges + `share_received` notification)
- Received view + sender: `022_get_feed.sql` (`p_view='received'`); `CardItem.tsx:27,95-98`
- Rate: `app/(app)/card/[id]/_components/CardView.tsx` (`RatingSlider` → `rateCardAction`); `RatingSlider.tsx` (0–100 range, fires on mouseup/touchend); `015_upsert_rating.sql`, `118_ratings_0_100.sql`
- Notifications: `app/(app)/notifications/_components/NotificationsView.tsx:40,54-57` (`/card/[id]` links); `058_realtime_notifications.sql`
- Invites: `app/(app)/friends/_components/FriendsView.tsx:44-50`; `112_f7_write_rpcs.sql` (`invite_friend`); `113_backfill_pending_friend_invites.sql`
- Metadata extraction: `supabase/functions/extract-node-metadata/index.ts:44-50,109-164`; `_html.ts`; `_tags.ts`
- `/flow` mock: `app/flow/page.tsx`; `app/flow/layout.tsx`; `flow/store.ts`; `flow/lib/mock.ts`; `components/ui/UixSwitch.tsx`

*End of report — PORTFOLIO-AUDIT-001*

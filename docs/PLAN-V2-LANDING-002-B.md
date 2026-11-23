# PLAN-V2-LANDING-002-B — Waitlist backend: investigation and implementation plan

**Project:** LIKED · **Task ID:** V2-LANDING-002-B-PLAN · **Date:** 2026-11-23
**Mode:** PLAN ONLY. No migration file, no application code, no database change. The DDL below is text for CTO audit.
**Base:** `origin/main` = `10fd3c5` (read this session).
**Legend.** **VERIFIED** = read in a file this session (path:line given) or taken from a repo document that records a live check (cited). **UNVERIFIED** = could not be confirmed; the reason is given. Every UNVERIFIED item is collected again in section I.

**Verdict in four lines**
1. Next free migration is **147**. One file, `147_v2_waitlist.sql`: table `waitlist_signups`, `join_waitlist()` (service_role only, `RETURNS void`, idempotent), plus a small dedicated rate-limit table and function.
2. Route `POST /api/waitlist`: honeypot returns the identical `200 {"ok":true}`; duplicate returns the same; raw IP is never stored; the e-mail never reaches a log.
3. Rate limiting: **recommend option (c)**, a dedicated hashed-IP counter with self-purging TTL, plus an optional Vercel firewall rule as an outer shield. Option (a) does not exist as a limiter on main, and the DB primitive it would reuse has no scheduled purge.
4. The migration PR is `merge == apply` to production. It must be CTO-audited and dry-run in a rollback harness before merge. The live LIKED database could **not** be reached this session (section I).

---

## A. Findings (Step 1)

### A.1 Conventions of the audited migrations 142–146

Latest migration on main: **`146_v2_delete_account.sql`**. 142 files in `supabase/migrations/`; the last five are `142_v2_inbox_core.sql` … `146_v2_delete_account.sql` (VERIFIED, `ls`). Filename convention: `NNN_snake_case.sql`, three digits, no gaps; 142–146 carry the `v2_` prefix. The next file is **`147_v2_waitlist.sql`**. The ledger name is the filename minus the number prefix and `.sql` (`scripts/record-migrations-backfill.mjs:3-6`).

| Aspect | Convention | Evidence |
|---|---|---|
| Function attributes | `LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`, dollar tag `$function$`, plain `CREATE FUNCTION` | `144_v2_guest_submit.sql:28-33`, `143_v2_inbox_support.sql:149-154`, `146_v2_delete_account.sql:31-36` |
| In-body guard (class S) | `IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501'; END IF;` as first statement | `144:42-44`, `143:159-161` (`rl_hit`), `146:49-51` |
| Input validation | static-string `RAISE EXCEPTION '…' USING ERRCODE = '22023'`; no value interpolated into any message | `144:78`, `146:53,56` |
| Function grants | right after each function: `REVOKE ALL ON FUNCTION … FROM PUBLIC, anon, authenticated;` then `GRANT EXECUTE ON FUNCTION … TO service_role;`. The REVOKE is mandatory because `pg_default_acl` auto-grants new functions to anon/authenticated | `144:11-16` (header), after every function in 144, last lines of 146 |
| Table posture | `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` + `REVOKE ALL ON … FROM PUBLIC, anon, authenticated;`, **no `CREATE POLICY`**; service_role keeps its default grant; no `FORCE ROW LEVEL SECURITY` | `142:10-14`, `142:41-42`, `143:61-62` (same two statements after every table) |
| Constraints | inline `CHECK`, named only when useful (`items_identity_format`); index names `<table>_<purpose>` | `142:82` (`items_identity_format`), `142:55` (`contributors_last_seen`) |
| Comments | header block: migration number, task ID, plan section; "Security posture" and "Scope guard" paragraphs; `-- ----` banner per object; **no `COMMENT ON` anywhere** (0 hits in 142–146) | `142:1-24`, `144:1-22`, `146:1-20` |
| Transaction control | none (0 `BEGIN`/`COMMIT` lines). The rollback harnesses refuse any file that contains them | `scripts/verify-delete-account.mjs:42-43` |
| Class S vs O | a v2 function is class S (server-only) unless its name is in `V2_CLASS_O_NAMES` | `scripts/lib/v2-catalog-probes.mjs:28-41` |

`join_waitlist` and `waitlist_rate_hit` are class S and follow every row above; there is no deviation from the spec's posture.

### A.2 How migrations are recorded and checked

- **DB-7** (`scripts/check-invariants-001.mjs:111-118`): every numbered file in `supabase/migrations/` with a number ≥ 088 must be present in `supabase_migrations.schema_migrations`. A new, unapplied 147 makes DB-7 FAIL ("unrecorded: 147"). This is expected before merge; 144 and 145 reported the same (`docs/00_PROGRESS.md`, entries V2-W2-P0-03, P0-04).
- **CI does not run it.** `.github/workflows/ci.yml` runs `tsc --noEmit`, `eslint`, `vitest run`, `check-languages`, `check-contrast`, `npm run build`. `check-invariants-001.mjs` is documented as a local/pre-merge gate because it needs `DATABASE_URL` (`ci.yml` comment, lines 33-36). A migration PR therefore passes CI without proving anything about the SQL. **The rollback harness is the only pre-merge proof.**
- **Merge == apply.** The `supabase` GitHub App applies migrations when a PR touching `supabase/migrations/*` merges to main. Recorded as CONFIRMED for PR #38 at `docs/00_PROGRESS.md` row V2-W1A-DDL-001 (check "Supabase Preview" ran on the merge commit; skipped on PR heads). No repo script auto-applies. I did not re-verify this live this session (section I).
- **What a new migration must satisfy:** (1) filename `^\d+_.+\.sql$`, number 147; (2) no `BEGIN/COMMIT`/transaction control and no `CONCURRENTLY` (harness refuses; Supabase wraps it); (3) it must apply cleanly on the live schema, because a failure is only visible after merge; (4) after apply, the ledger gets the row automatically (the db-push writer shape: `statements` array, see PROGRESS row V2-W1A-CLOSEOUT-001); (5) Tier-0 checks that read the v2 files must be extended (A.3).

### A.3 delete_account coverage, DB-20/21/22/23 and `verify-v2-security`: what a waitlist table needs

| Check | Reads | Needs an entry for `waitlist_signups`? |
|---|---|---|
| **DB-22** `findCoverageGaps` (`scripts/lib/delete-account-coverage.mjs:112-136`) | live FKs to `public.users`/`auth.users`; uuid columns whose **name matches** `(user_id\|owner_id\|created_by\|…)` and have no FK (`scripts/lib/v2-catalog-probes.mjs:138-157`); payload keys of `notifications`/`email_outbox` | **No.** The table has no FK to users; its only uuid column is `id`, which the name pattern does not match; it is not a payload table. **No entry and no exclusion is required.** |
| **DB-20** (`scripts/check-invariants-001.db20.mjs:7-24`) | table list **derived from migrations 142 and 143 only** (`V2_TABLE_MIGRATIONS`) | **Not automatically.** 147 is not in the list, so the new tables are silently unchecked (RLS on, zero policies, no anon/authenticated grants). **Required: add `147_v2_waitlist.sql` to `V2_TABLE_MIGRATIONS`.** |
| **DB-21** (`scripts/lib/v2-catalog-probes.mjs:18-24`) | functions derived from `V2_FUNCTION_MIGRATIONS` (142–146 only) | **Not automatically.** **Required: add `147_v2_waitlist.sql`.** `join_waitlist` and `waitlist_rate_hit` then derive as class S, which asserts DEFINER, `search_path` contains `public`, no PUBLIC/anon EXECUTE, no authenticated EXECUTE, single overload, anon call → 42501. |
| **DB-23** | v2 function bodies: no `edges`/`folder_edges` DML, `causes` DML only as `delete_account` | No change; neither function touches those tables. |
| **REPO-15** (`check-invariants-001.mjs:445`) | regex list of table names that app code may not write with `.from(...).insert/update/delete/upsert` | **Required:** add `waitlist_signups\|waitlist_rate_limits`. |
| **REPO-16** (`check-invariants-001.mjs:540-553`) | `ASK_DIRS = ["app/api/ask","lib/ask"]` and `GUEST_CLASS_S_RPCS` | **Required:** add `join_waitlist`, `waitlist_rate_hit` to the RPC list and `app/api/waitlist`, `lib/waitlist` to the dirs. Effect: calls only via `getSupabaseServiceClient`, and no `"use client"` file may name either RPC. |
| **`verify-v2-security.mjs`** | derives tables and functions from the same lists | follows automatically once DB-20/21 lists are extended: tables 19 → 21, class-S functions 18 → 20 |
| **`scripts/v2-catalog-probes.test.ts:30-51`** | hard-coded counts: 30 functions, `V2_FUNCTION_MIGRATIONS` length 5, S = 18 | **Required update:** 32 / 6 / 20, plus a line for the 147 functions. CI runs this test, so a forgotten update fails CI. |

**delete_account interaction (decision needed, section I):** `delete_account` (migration 146) never touches the waitlist, and cannot cascade because there is no FK. A person who deletes their LIKED account keeps their waitlist row until it is removed by the runbook (F). This matches the spec ("until the person asks us to remove it"), but the privacy notice must say so. This plan does **not** modify `delete_account` (frozen, audited, out of scope).

### A.4 Rate limiter, service client, logging

- **No `/api/ask/*` limiter exists on main.** `app/api/` contains `auth, categorize, classify, extension, folders, import, nodes, users, youtube` and nothing else (VERIFIED, `find app/api`); there is no `lib/ask/`. `rl_hit` is only specified in `docs/PLAN-V2-002.md:456,610,782-803` and appears in code only in `scripts/` checks. What does exist is the **DB primitive** from migration 143: table `public.rate_limits(bucket, key_hash, window_start, hits)` (`143_v2_inbox_support.sql:52-62`, comment "raw IPs are never stored") and `rl_hit(p_bucket, p_key_hash, p_window_seconds, p_limit) RETURNS boolean` (`143_v2_inbox_support.sql:149-176`), class S, atomic fixed window. It is documented as applied and recorded (`docs/00_PROGRESS.md`, V2-W1A-CLOSEOUT-001); not re-verified live.
- **Its purge is not scheduled.** `housekeeping_purge()` (`143_v2_inbox_support.sql:552-578`) deletes `rate_limits` older than 2 days, but nothing calls it: `vercel.json` has only the two `/api/youtube/sync` crons, and `grep -r housekeeping app lib vercel.json` finds no route. `/api/cron/housekeeping` exists only as a plan item (`docs/PLAN-V2-002.md:637,990`). Consequence: any hashed-IP row written into `rate_limits` today is retained **indefinitely**. This decides section D.
- **Service client:** `getSupabaseServiceClient()` in `lib/supabase/service.ts:11-31` reads `SUPABASE_SECRET_KEY`, throws if unset, `createClient<Database>` with `persistSession:false`. Routes call it directly, e.g. `app/api/extension/folders/route.ts:32`, `app/api/youtube/callback/route.ts:172`. Do **not** use `lib/db/rpc.ts`: it uses the session (cookie/anon) client (`lib/db/rpc.ts:14-19`), which has no EXECUTE on a class-S function, and it throws `[RPC:fn] ${error.message}`.
- **Types:** `Database` is generated (`scripts/generate-types.ts`, `lib/types/database.ts`). A typed `.rpc("join_waitlist")` needs regenerated types after the migration applies; this drives the task order in J.
- **Logging today:** `lib/utils/logger.ts:7-17` is a no-op in production (`isDev` gate). Existing routes return raw `err.message` in 500 bodies (`app/api/users/create/route.ts:40`, `app/api/youtube/search/route.ts:39`). **Do not copy that pattern.** For this route it is dangerous: a PostgREST error for a violated CHECK carries a `details` field that contains the failing row, which includes the e-mail. The no-email-in-logs guarantee therefore has to be structural (C.6).
- **Client IP:** no route reads `x-forwarded-for`/`x-real-ip` today (`grep` in `app lib proxy.ts`: 0 hits). REPO-19 forbids those headers only under `i18n` and `lib/i18n` (`check-invariants-001.mjs:509-516`).

### A.5 How existing routes validate input and shape errors

There is **no shared validation helper and no schema library** (`package.json` has no zod/valibot). Routes hand-roll: `try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }`, then inline `typeof`/trim/length checks, then `NextResponse.json({ error: '…' }, { status })` (`app/api/users/create/route.ts:12-34`). The only success shape in use is `{ ok: true }` (same file, line 38). The waitlist route reuses this style (same `{ error }` key, extended to `{ ok:false, error:<code> }`) and adds a small pure `lib/waitlist/validate.ts` so the rules are unit-testable. Existing e-mail syntax check, the only one: `app/lib/actions/friends.ts:38` `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. The route's regex is a stricter superset of that idea.

Route-test pattern to copy: `app/(auth)/callback/route.test.ts:1-40` (mock `@/lib/supabase/service` with `vi.fn()`, call the exported handler with a `Request`). Harness pattern to copy for DB tests: `scripts/verify-guest-submit-144.mjs` (BEGIN … ROLLBACK, `set_config('request.jwt.claim.role','service_role',true)` at line 159, `SET LOCAL ROLE anon|authenticated` at 432-441).

### A.6 Task A (V2-LANDING-002-A) stub

**Not merged.** `app/api/waitlist/` does not exist on main; open PRs are only #43 (held legal PR); no branch for V2-LANDING-002-A exists. The landing is `components/landing/LandingV2.tsx` with `components/landing/config.ts` (`LANDING_VARIANT`) from V2-LANDING-001-R2. This plan therefore **designs against the spec**: constants `WAITLIST_NOTICE_VERSION = "v1"`, `CONTACT_EMAIL`, env `WAITLIST_ENABLED`, form fields `{email, website, locale}`. **Unknown until A merges:** the file that holds those constants, the helper that reads `WAITLIST_ENABLED`, the stub's exact response, and whether the form tolerates a non-JSON 429. The implementation task (J: IMPL-3) must reconcile with A's actual files, and must reuse A's constants and enabled-helper rather than redefine them.

### A.7 E-mail normalization helpers

None for e-mail. The only normalizer is `normalizeDisplayName` (`lib/utils/normalize.ts:12-17`: trim → lowercase → NFKC, per PRD §32.3). The DB function uses the same recipe for e-mail: trim → lowercase (stored in `email`), then NFKC (stored in `email_normalized`, the dedup key). No Gmail dot/plus folding: that would merge different mailboxes on other providers.

---

## B. Exact DDL (text only, for CTO audit)

File to create in IMPL-1: `supabase/migrations/147_v2_waitlist.sql`. Nothing here is applied.

```sql
-- ============================================================
-- Migration 147 — Landing waiting list: waitlist_signups,
-- waitlist_rate_limits, join_waitlist, waitlist_rate_hit
-- (plan docs/PLAN-V2-LANDING-002-B.md §B; task V2-LANDING-002-B-IMPL-1)
-- ============================================================
-- Two tables, two SECURITY DEFINER class-S functions.
--
-- Security posture identical to migrations 142-146 (§1.3):
--   tables: ENABLE ROW LEVEL SECURITY; REVOKE ALL FROM PUBLIC,
--   anon, authenticated; NO CREATE POLICY. Functions: in-body
--   guard auth.role() = 'service_role' (42501), SET search_path
--   = public, EXECUTE revoked from PUBLIC/anon/authenticated
--   and granted to service_role only (pg_default_acl auto-grants
--   new functions to anon/authenticated, so the REVOKE is required).
--
-- Privacy: waitlist_signups stores the e-mail, UI locale and the
-- notice version the person saw. NO IP address, user agent,
-- referrer or analytics id. waitlist_rate_limits stores only a
-- keyed hash (HMAC computed in the route) with a window start.
-- Retention of signups: until the person asks for removal; no
-- automatic purge. Rate-limit rows self-purge after 1 hour.
--
-- Scope guard: NO FK to users, NO policies, NO table grants, NO
-- change/DROP of any existing object, nothing touching
-- edges/causes/folder_edges, no link-management object touched
-- (LINKS-PAUSE).
-- ============================================================

-- ------------------------------------------------------------
-- 1. waitlist_signups
--    email            = trimmed + lower-cased input (what a future
--                       mailing would use)
--    email_normalized = NFKC of email (the dedup key)
--    locale           = UI language of the form (kept in sync with
--                       LANGUAGES in lib/i18n/languages.ts by a
--                       vitest, plan §E)
--    notice_version   = privacy notice version shown at signup,
--                       set by the server (never by the client)
--    notified_at      = reserved for a future mailing
-- ------------------------------------------------------------
CREATE TABLE public.waitlist_signups (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email            text        NOT NULL,
  email_normalized text        NOT NULL,
  locale           text        NOT NULL,
  notice_version   text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  notified_at      timestamptz,
  CONSTRAINT waitlist_signups_email_normalized_key UNIQUE (email_normalized),
  CONSTRAINT waitlist_signups_email_shape CHECK (
        char_length(email) BETWEEN 3 AND 254
    AND email = lower(email)
    AND email ~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+\.[^@[:space:][:cntrl:]]+$'
  ),
  CONSTRAINT waitlist_signups_email_normalized_shape CHECK (
        char_length(email_normalized) BETWEEN 3 AND 254
    AND email_normalized ~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+\.[^@[:space:][:cntrl:]]+$'
  ),
  CONSTRAINT waitlist_signups_locale_check CHECK (locale IN ('en','fr','es','th')),
  CONSTRAINT waitlist_signups_notice_version_check CHECK (notice_version ~ '^[A-Za-z0-9._-]{1,32}$')
);
-- The UNIQUE constraint creates the unique index on email_normalized.
-- No other index: the table is read only by the runbook (plan §F);
-- a partial index on notified_at IS NULL belongs to the future mailing task.

ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.waitlist_signups FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 2. join_waitlist — the ONE write path for signups.
--    Idempotent on email_normalized: a duplicate is a silent
--    no-op (first signup wins: its locale and notice_version are
--    kept as the consent record). RETURNS void on purpose: the
--    function cannot reveal whether the address already existed,
--    even if a route bug serialised its result. Invalid input
--    raises 22023 with a static message (no value interpolated).
-- ------------------------------------------------------------
CREATE FUNCTION public.join_waitlist(p_email text, p_locale text, p_notice_version text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_email text;
  v_norm  text;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_email IS NULL THEN
    RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023';
  END IF;
  v_email := lower(regexp_replace(p_email, '^\s+|\s+$', '', 'g'));
  IF char_length(v_email) NOT BETWEEN 3 AND 254
     OR v_email !~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+\.[^@[:space:][:cntrl:]]+$' THEN
    RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023';
  END IF;
  IF p_locale IS NULL OR p_locale NOT IN ('en','fr','es','th') THEN
    RAISE EXCEPTION 'invalid locale' USING ERRCODE = '22023';
  END IF;
  IF p_notice_version IS NULL OR p_notice_version !~ '^[A-Za-z0-9._-]{1,32}$' THEN
    RAISE EXCEPTION 'invalid notice version' USING ERRCODE = '22023';
  END IF;
  v_norm := normalize(v_email, NFKC);
  -- NFKC can change shape (e.g. a full-width '@' becomes '@'): re-check.
  IF char_length(v_norm) NOT BETWEEN 3 AND 254
     OR v_norm !~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+\.[^@[:space:][:cntrl:]]+$' THEN
    RAISE EXCEPTION 'invalid email' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.waitlist_signups (email, email_normalized, locale, notice_version)
  VALUES (v_email, v_norm, p_locale, p_notice_version)
  ON CONFLICT (email_normalized) DO NOTHING;
END;
$function$;

REVOKE ALL ON FUNCTION public.join_waitlist(text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_waitlist(text, text, text) TO service_role;

-- ------------------------------------------------------------
-- 3. waitlist_rate_limits — hashed-IP fixed-window counter with a
--    short TTL (plan §D option c). key_hash is HMAC-SHA256(pepper,
--    ip) hex computed in the route; the database never sees an IP.
-- ------------------------------------------------------------
CREATE TABLE public.waitlist_rate_limits (
  key_hash     text        NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz NOT NULL,
  hits         integer     NOT NULL DEFAULT 1 CHECK (hits >= 1),
  PRIMARY KEY (key_hash, window_start)
);
CREATE INDEX waitlist_rate_limits_purge ON public.waitlist_rate_limits (window_start);

ALTER TABLE public.waitlist_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.waitlist_rate_limits FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------
-- 4. waitlist_rate_hit — atomic fixed-window hit; returns true
--    while hits <= p_limit. Deletes rows older than 1 hour on
--    every call (TTL without a scheduler). Window is capped at
--    3600 s so the purge can never delete a live window.
-- ------------------------------------------------------------
CREATE FUNCTION public.waitlist_rate_hit(p_key_hash text, p_window_seconds integer, p_limit integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_window timestamptz;
  v_hits   integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;
  IF p_key_hash IS NULL OR p_key_hash !~ '^[0-9a-f]{64}$'
     OR p_window_seconds IS NULL OR p_window_seconds NOT BETWEEN 1 AND 3600
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'invalid waitlist_rate_hit arguments' USING ERRCODE = '22023';
  END IF;
  DELETE FROM public.waitlist_rate_limits
  WHERE window_start < now() - interval '1 hour';
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  INSERT INTO public.waitlist_rate_limits (key_hash, window_start, hits)
  VALUES (p_key_hash, v_window, 1)
  ON CONFLICT (key_hash, window_start)
  DO UPDATE SET hits = waitlist_rate_limits.hits + 1
  RETURNING hits INTO v_hits;
  RETURN v_hits <= p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.waitlist_rate_hit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.waitlist_rate_hit(text, integer, integer) TO service_role;
```

**Dry run of this exact DDL (done in this task, not on any project database).** The SQL block above was extracted from this document and executed on a throwaway local PostgreSQL 16.15 cluster (UTF-8), with stub roles `anon`, `authenticated`, `service_role`, a stub `auth.role()` reading `request.jwt.claim.role`, and default privileges replicating Supabase's auto-grant to the three roles. Result: the migration applies without error, and 66 of 66 cases from E.1 passed (RLS on, zero policies, no anon/authenticated grants, `proacl` = `{postgres, service_role}`; anon/authenticated denied on both tables and both functions; service_role insert lowercases and trims; duplicate with different case/whitespace/locale/version is a no-op and the first signup wins; full-width variants dedupe through NFKC; 254-character e-mail accepted and 255 rejected; every invalid e-mail/locale/notice_version case raises 22023 and writes nothing; each table CHECK rejects a direct bad insert; limiter returns t,t,t,f at limit 3; bad limiter arguments raise 22023; a 2-hour-old rate-limit row is purged and a live 3600 s window is not; the wrong-claim call raises 42501 even though EXECUTE is held). All rolled back; no residue. The scratch scripts are not committed (one document only). **This proves syntax and logic on stock PostgreSQL 16, not behaviour on the live Supabase schema**; IMPL-1's harness must repeat it on LIKED (section I, item 1).

**Semantics.**
- *Idempotency:* `ON CONFLICT (email_normalized) DO NOTHING`. Two concurrent identical calls are safe (the unique index serialises; one inserts, one is a no-op). The first signup wins and its `locale`/`notice_version` are preserved as the consent record; a later signup in another language does not overwrite it.
- *Returns:* `void`. Success = no exception. The route never learns "new vs duplicate". Counting signups is a SQL job (F), not an API job.
- *Errors:* `42501` not service_role (misconfigured key); `22023` invalid input (static messages). Nothing else is raised by the function itself. A CHECK violation can only happen if function and constraints disagree; the harness proves they do not (E.1).
- *Why a CHECK **and** function validation:* the spec asks for validation inside the function; the CHECKs make a future second writer (a maintenance SQL, a later function) unable to insert junk.
- *Regex looseness:* the DB regex is deliberately the **loosest** acceptable shape (`local@domain.tld`, no whitespace/control chars). The route is stricter (C.2). Rule enforced by a test: anything the route accepts, the DB accepts; otherwise the route would answer 200 and the DB would raise.
- *Locale list* is duplicated in the CHECK, the function and `LANGUAGES` (`lib/i18n/languages.ts:14-19`). Adding a language needs a new migration; a vitest asserts the three lists are equal (E.2).
- `normalize(text, NFKC)` needs PostgreSQL ≥ 13 and a UTF-8 database. **UNVERIFIED live**; the harness (E.1, case DB-12) fails loudly if absent.
- `gen_random_uuid()` is built in (used by 142–146).

---

## C. Route design: `POST /api/waitlist`

### C.1 Files (implementation task IMPL-3)

- `app/api/waitlist/route.ts` replaces task A's stub. `export const runtime = "nodejs"; export const dynamic = "force-dynamic";` (uses `node:crypto` and the service client). Read `node_modules/next/dist/docs/` first, as `CLAUDE.md` requires: this repo's Next is 16.x with breaking changes and `node_modules` was not installed for this plan (section I).
- `lib/waitlist/validate.ts`: pure functions, no I/O.
- `lib/waitlist/rateKey.ts`: the **only** file in the repo allowed to read `x-forwarded-for`/`x-real-ip` outside i18n (guarded, E.3). Returns HMAC hex.
- `lib/waitlist/log.ts`: the only way the route may log (C.6).
- Reuse task A's `WAITLIST_NOTICE_VERSION`, `CONTACT_EMAIL`, and its `WAITLIST_ENABLED` helper. Do not redefine them.

### C.2 Validation rules

Applied in this order (cheapest first, nothing touches the DB before step 3):

1. **Enabled gate.** If the same condition that hides the form in task A is false (production and `WAITLIST_ENABLED !== "1"`): respond **404** with an empty body, identical to the stub. No limiter, no DB.
2. **Cheap request checks (no DB):** `Content-Type` must be `application/json` (else 400); declared `Content-Length` above the cap → 400; if `Origin` is present and its host differs from the request host → 400 (blocks cross-site browser posts; non-browser clients send no Origin and pass; defence in depth only, not authentication).
3. **Rate limit** (D): `waitlist_rate_hit(hmac(ip), 600, 10)`. `false` → **429** + `Retry-After`. Limiter error → **500** (fail closed; an unthrottled insert path is worse than a failed signup).
4. **Read body with a byte cap of 2048** by streaming the request body and aborting past the cap (a lying or absent `Content-Length` must not bypass it) → 400 `invalid_body`. A valid payload is under ~400 bytes (254-char e-mail + JSON).
5. **Parse JSON.** Not an object (array, string, number, null) or syntax error → 400 `invalid_body`. Unknown fields are ignored and never stored.
6. **Honeypot.** If `website` is anything other than absent, `null` or a string that is empty after `trim()` (a non-string value counts as filled): return **200 `{"ok":true}`**, store nothing, call no RPC, log event `honeypot` (no fields). The honeypot check runs **before** field validation so a bot cannot tell it from a normal success by probing with bad fields. It still consumes a limiter hit (step 3 already ran).
7. **Validate `email`:** must be a string; `trim()`; length 3–254; local part ≤ 64; exactly one `@`; no whitespace or control characters anywhere; domain contains at least one dot, does not start/end with a dot or hyphen label, no `..`. Any failure → 400 `invalid_email`. The route sends the trimmed value; the database owns lower-casing and NFKC (one authority; no JS/PG `lower()` divergence).
8. **Validate `locale`:** string, exactly one of `LANGUAGE_CODES` from `lib/i18n/languages.ts` (`en, fr, es, th`; the same set the DB CHECK enforces). Missing or unknown → 400 `invalid_locale`. No silent fallback to `en`.
9. **`notice_version`** comes from task A's server constant. A client-supplied `notice_version` (or any other field) is ignored.
10. **RPC:** `getSupabaseServiceClient().rpc("join_waitlist", { p_email, p_locale, p_notice_version })`. No other client; no `.from("waitlist_signups")` anywhere (REPO-20, E.3).

### C.3 Response matrix

All responses: `Content-Type: application/json` (404 empty), `Cache-Control: no-store`, no cookies, no CORS headers.

| Situation | Status | Body |
|---|---|---|
| Valid new e-mail | 200 | `{"ok":true}` |
| Valid duplicate (any case/whitespace variant, any locale) | 200 | `{"ok":true}` (byte-identical to above) |
| Honeypot filled | 200 | `{"ok":true}` (byte-identical), nothing stored |
| Not JSON content-type, unparsable, wrong type, oversize | 400 | `{"ok":false,"error":"invalid_body"}` |
| Bad e-mail | 400 | `{"ok":false,"error":"invalid_email"}` |
| Bad locale | 400 | `{"ok":false,"error":"invalid_locale"}` |
| RPC raised `22023` (route/DB rule mismatch; should never happen) | 400 | `{"ok":false,"error":"invalid_email"}`; logged as `rpc_invalid` |
| Rate limited | 429 | `{"ok":false,"error":"rate_limited"}` + `Retry-After: <seconds to window end>` |
| Disabled in production | 404 | empty |
| Missing `RATE_LIMIT_PEPPER` in production, limiter or RPC error, `42501`, anything unexpected | 500 | `{"ok":false,"error":"server_error"}`, generic, never `err.message` |
| Method other than POST | 405 | handled by Next (only `POST` is exported) |

The spec's matrix lists 200/400/429; **500 and 404 are additions** that cannot be avoided (a failure must not say `ok`, and disabled must look like the stub). 429 and 400 are per request/IP, never per e-mail, so neither leaks whether an address exists. Timing: the honeypot path skips the RPC and is faster; a bot would need to measure it, which this plan does not defend against.

### C.4 Honeypot behaviour

Field name `website` (task A). Empty (or whitespace-only) is the only accepted value. A non-empty value returns the same success and writes nothing, so a bot gets no signal. It is a deterrent against naive form-fillers only; it does nothing against a targeted script (section I).

### C.5 Error handling

One `try/catch` around everything after step 1. The `catch` returns the generic 500 and logs a fixed event code. The supabase-js result is destructured; only `error.code` (a 5-character SQLSTATE) may be used, and only if it matches `/^[0-9A-Z]{5}$/`. `error.message`, `error.details`, `error.hint` and the thrown error object are never logged, returned, or attached to anything: PostgREST `details` for a constraint failure includes the failing row (the e-mail).

### C.6 Logging policy (how "no e-mail in logs" is guaranteed)

1. **Structural:** `lib/waitlist/log.ts` exports `logWaitlist(event, code?)` where `event` is a closed union (`"honeypot" | "rate_limited" | "limiter_error" | "rpc_error" | "rpc_invalid" | "config_missing" | "unexpected"`) and `code` an optional SQLSTATE string. There is no free-form argument, so an e-mail, an IP, a hash or an error message cannot be passed in without a type error. It writes with `console.error`/`console.warn` (the repo `logger` is silent in production, so it would hide real failures).
2. **Nothing else logs** in `app/api/waitlist/**` or `lib/waitlist/**`: no `console.*`, no `logger.*` (E.3 grep guard).
3. **Never log:** request body, headers, IP, hash, `err.message/details/hint/stack` of anything that saw the RPC.
4. **Test:** a vitest spies on `console.*`/`process.stdout.write`, runs every response path with a distinctive e-mail, and asserts that string never appears in any captured output (E.2).
5. **Outside our control (state it in the privacy notice):** Vercel's platform request logs and Supabase's logs contain the client IP and may contain the request URL. The POST body is not logged by Vercel by default. UNVERIFIED for the project's log-drain configuration.

---

## D. Rate limiting without raw IPs on serverless

In-memory counters are rejected: each serverless instance has its own memory (`143_v2_inbox_support.sql:52` says the same).

### D.1 Options compared

| | (a) Reuse the `/api/ask/*` limiter | (b) Vercel Firewall rule | (c) Dedicated hashed-IP counter, short TTL |
|---|---|---|---|
| Exists on main? | **No route-level limiter exists.** Only the DB primitive `rate_limits` + `rl_hit` (migration 143) | Dashboard feature; nothing in repo | New (DDL in B) |
| Stores IP-derived data in our DB | Yes: keyed hash, in the shared `rate_limits` table | **No** (Vercel enforces at the edge; we store nothing) | Yes: keyed hash, own table |
| TTL / cleanup | `housekeeping_purge` deletes > 2 days, **but nothing schedules it** (A.4): rows persist indefinitely until `/api/cron/housekeeping` ships | Not applicable | Self-purge > 1 h on every call; residual: after the last call, rows stay until the next call or the runbook purge |
| New DDL / audit surface | None | None | 1 table + 1 function (≈ 40 lines) |
| Unit-testable in repo / CI | Yes | **No** (dashboard config, not versioned) | Yes (harness + vitest) |
| Cost per request | 1 DB write | 0 (blocks before the function runs) | 1 DB write |
| Bypass | rotating IPs | rotating IPs | rotating IPs |
| Response format | our JSON 429 | Vercel's own 429 page/body (form must tolerate non-JSON) | our JSON 429 |
| Plan/availability | n/a | **UNVERIFIED** (rule count and rate-limit rule availability depend on the Vercel plan; the plan tier is unknown) | n/a |
| Couples to other features | Yes: shared table, shared purge, future ask feature | No | No; whole feature drops as one unit |

### D.2 Recommendation

**Use (c). Add (b) as an optional outer layer; do not depend on it.** Reject (a) for now.

- **Why not (a):** there is no limiter to reuse, only a primitive, and its purge job does not run. Writing hashed IPs into it today means they live forever, which contradicts "short TTL". (a) becomes the right answer once `/api/cron/housekeeping` ships and the ask routes establish the shared pattern; migrating then is a one-line change of the RPC name.
- **Why (c):** it is the same technique as `rl_hit` (atomic fixed window, keyed hash), self-contained, TTL enforced without a scheduler, droppable as a unit, fully testable. The price is one more table and function for the CTO to audit and a second DB write per request.
- **Why also (b):** it stops floods before they cost a function invocation or a DB write, and keeps working if the DB is slow. It cannot be the only layer: unversioned, untestable, plan-dependent.

### D.3 Parameters and key derivation

- **Limit:** 10 hits per 600 s (fixed window) per key. Every request that gets past the cheap checks counts (valid, invalid, honeypot). Generous enough for typos and a shared NAT of a few people; a shared campus/carrier NAT can still be throttled (accepted, section I). Constants live in `lib/waitlist/config.ts`.
- **Global cap: deliberately none.** A global limit lets an attacker lock every real person out. Junk growth is monitored with the runbook query (F), not blocked.
- **Client IP:** first value of `x-forwarded-for`, else `x-real-ip` (Vercel sets both at the edge). That clients cannot spoof them on Vercel is a platform claim that is **UNVERIFIED** here (same status as `docs/PLAN-V2-002.md:784`). If spoofable, the per-IP limit is bypassable; the honeypot, the 2 KB cap and the WAF rule remain.
- **Normalise before hashing:** IPv4 as is; IPv6 truncated to its /64 (one subscriber). Missing IP → constant key `"unknown"` (shared bucket; only happens locally).
- **Hash:** `HMAC-SHA256(RATE_LIMIT_PEPPER, ip)` as lowercase hex (64 chars, matches the CHECK). The pepper is the env var already planned in `docs/PLAN-V2-002.md:298,825,1203`. **In production, a missing pepper → 500 and event `config_missing`** (fail closed). An unkeyed hash of an IPv4 address (2³² values) is reversible in seconds, so an unkeyed fallback would be a fake privacy measure. Development uses a fixed dev pepper.

### D.4 Privacy implications (blunt)

- Raw IPs are never written to the database, logs we control, or the table. The IP exists in route memory for the request only.
- A keyed hash is still **pseudonymous personal data** while the pepper exists. The honest statement for the notice is "we do not store your IP address; a keyed, non-reversible-without-our-secret fingerprint is kept for at most about an hour to limit abuse". Do **not** write "we collect no IP-related data": Vercel's logs process IPs anyway (C.6.5).
- Retention: ≤ 1 hour after the last request in a window, extended only if no further request arrives to trigger the purge (then it waits for the next request or the runbook purge, F.5). Optional hardening: a daily Vercel cron or `pg_cron` calling a purge (UNVERIFIED availability) or folding the delete into `housekeeping_purge` when it ships.
- Rotating the pepper invalidates all existing hashes immediately (acceptable; rows are disposable).

### D.5 Cleanup

Built into `waitlist_rate_hit` (`DELETE … WHERE window_start < now() - interval '1 hour'` before each hit, served by `waitlist_rate_limits_purge`). Manual backstop: `DELETE FROM public.waitlist_rate_limits;` is always safe (F.5). Removal on rollback: dropped with the feature (G).

---

## E. Tests to write in the implementation tasks

### E.1 DB harness: `scripts/verify-waitlist-147.mjs` (rollback pattern)

Same safety shape as `scripts/verify-delete-account.mjs` and `verify-guest-submit-144.mjs`: LIKED project guard, runs the **text of 147** inside one transaction, refuses a file containing transaction control, **always ROLLBACK**, prints per-case PASS/FAIL, exits non-zero on any FAIL, reports zero residue (row counts of the two tables before/after).

| ID | Case | Expected |
|---|---|---|
| DB-1 | `waitlist_signups`, `waitlist_rate_limits`: `relrowsecurity` | true, true |
| DB-2 | `pg_policies` rows for both tables | 0 |
| DB-3 | `information_schema.role_table_grants` for anon/authenticated | none |
| DB-4 | as `anon` and `authenticated`: `SELECT`, `INSERT`, `UPDATE`, `DELETE` on both tables | each fails 42501 |
| DB-5 | as `anon` and `authenticated`: `SELECT public.join_waitlist(...)` and `waitlist_rate_hit(...)` | 42501 each (no oracle on args) |
| DB-6 | `proacl` of both functions | exactly `{postgres, service_role}` |
| DB-7 | as `service_role` (claim set as in `verify-guest-submit-144.mjs:159`): `join_waitlist('Foo@Example.com','en','v1')` | returns, 1 row, `email='foo@example.com'` |
| DB-8 | same call with `' FOO@example.COM '`, locale `fr`, version `v2` | no error, still 1 row; stored `locale='en'`, `notice_version='v1'` (first wins) |
| DB-9 | `service_role` claim set to `authenticated` then call | 42501 (in-body guard, independent of grants) |
| DB-10 | invalid e-mails: NULL, `''`, `'a'`, `'a@b'`, `'a@@b.c'`, `'a b@c.d'`, tab/newline inside, 255-char, full-width `'a＠b.c'`, NFKC-creates-`@` case | each 22023 |
| DB-11 | invalid locale (`'de'`, `'EN'`, NULL, `''`); invalid notice_version (NULL, `''`, 33 chars, `'v 1'`, `'v1;'`) | 22023 each, zero rows written |
| DB-12 | `normalize('ＡＢ@example.com', NFKC)` works; dup via full-width variant `'ＡＢ@example.com'` vs `'ab@example.com'` | 1 row (also proves PG ≥ 13 + UTF-8) |
| DB-13 | direct `INSERT` as postgres violating each CHECK (uppercase email, bad locale, bad notice_version, email_normalized with space, length 255) | each rejected by the named constraint |
| DB-14 | unique index on `email_normalized` exists; constraint name matches | present |
| DB-15 | `id` default, `created_at` default `now()`, `notified_at` NULL after insert | as specified |
| DB-16 | no FK on `waitlist_signups` (`pg_constraint` contype='f') | 0 |
| DB-17 | `waitlist_rate_hit`: with limit 3, calls 1-3 → true, call 4 → false | as stated |
| DB-18 | rate hit with a different `key_hash` | independent counter, true |
| DB-19 | invalid args: bad hash (`'abc'`, uppercase hex), window 0 and 3601, limit 0 and 1001, NULLs | 22023 each |
| DB-20 | purge: insert a row with `window_start = now() - interval '2 hours'`, call `waitlist_rate_hit` | old row deleted; current row untouched |
| DB-21 | purge never deletes a live window: window 3600, immediate second call | counter increments (`hits=2`) |
| DB-22 | `has_function_privilege` for PUBLIC/anon/authenticated/service_role on both functions | f/f/f/t |
| DB-23 | zero residue: table counts identical before/after ROLLBACK | equal |

### E.2 Route tests (vitest, `app/api/waitlist/route.test.ts`, `lib/waitlist/*.test.ts`)

Mock `@/lib/supabase/service` as in `app/(auth)/callback/route.test.ts:16`. Env stubbed per test.

- **Valid** → 200 `{"ok":true}`; RPC called once with `p_email` trimmed, `p_locale`, `p_notice_version` equal to the server constant; **a client-sent `notice_version` or `ip` field is ignored**.
- **Duplicate:** mock RPC returns no error twice → both 200 with byte-identical body and headers.
- **Honeypot** (`"x"`, `" "` is *not* honeypot, `1`, `true`, `{}`, `["a"]`) → 200 identical body, **RPC not called**; limiter still called.
- **Invalid:** missing/non-string/empty e-mail, 255 chars, no `@`, two `@`, spaces, control chars, local part 65, `a@b`, `a@.com`, `a@b..com`, `.` edge cases → 400 `invalid_email`; locale `de`, `EN`, missing, number → 400 `invalid_locale`; body `[]`, `"x"`, `null`, `{`, wrong content-type → 400 `invalid_body`.
- **Oversize:** body 2049 bytes; also a stream with no `Content-Length` → 400, **RPC not called**.
- **429:** limiter mock returns `false` → 429, `Retry-After` present, RPC not called; limiter throws → 500 and RPC not called.
- **Disabled:** production env without `WAITLIST_ENABLED=1` → 404, nothing called; with `1` → normal.
- **Missing pepper in production** → 500, `config_missing`, nothing called.
- **RPC errors:** `{code:'22023'}` → 400; `{code:'42501'}` / network throw → 500, generic body, **body never contains the error text**.
- **No e-mail in logs:** spy on `console.log/info/warn/error`, `process.stdout.write`, `process.stderr.write`; run every path above with e-mail `canary.7f3a@example.com`; assert the string (and its lower/upper-case forms, and the canary IP and hash) appears in **no** captured argument. Include an RPC error whose `details` contains the canary: it must still not appear.
- **Rate key:** IPv4 and IPv6 /64 normalisation, `x-forwarded-for` list takes the first value, empty → `"unknown"`, output is 64 lowercase hex chars, different peppers give different hashes, same input gives same hash.
- **Drift tests:** the DB CHECK locale list (parsed from `147_v2_waitlist.sql`), the function's list and `LANGUAGE_CODES` are equal; the route's accepted e-mail set is a subset of the DB regex (table of cases run against the regex text parsed from the migration).
- **E2E (Playwright), minimal and safe:** `e2e/` runs against the project's single Supabase (prod) backend, so **no e2e may submit a valid e-mail** (it would create a real row). Allowed: 404 when disabled, 400 on bad body, honeypot 200. These still write limiter rows (hashed, TTL 1 h); acceptable and documented.

### E.3 Invariant and coverage script changes (IMPL-2, after the migration is applied)

1. `scripts/check-invariants-001.db20.mjs:7`: add `147_v2_waitlist.sql` to `V2_TABLE_MIGRATIONS` (DB-20: 19 → 21 tables).
2. `scripts/lib/v2-catalog-probes.mjs:18`: add `147_v2_waitlist.sql` to `V2_FUNCTION_MIGRATIONS` (DB-21 and `verify-v2-security`: 30 → 32 functions, S 18 → 20; class-O list unchanged).
3. `scripts/check-invariants-001.mjs:445` (REPO-15): add `waitlist_signups|waitlist_rate_limits` to `domainWriteRe`.
4. `scripts/check-invariants-001.mjs:540-553` (REPO-16): add `join_waitlist`, `waitlist_rate_hit` to `GUEST_CLASS_S_RPCS`; add `app/api/waitlist`, `lib/waitlist` to `ASK_DIRS`.
5. **New REPO-20:** in `app/**`, `lib/**`, `components/**` no `.from("waitlist_signups")`/`.from("waitlist_rate_limits")` with any verb; in `app/api/waitlist/**` and `lib/waitlist/**` no `console.` or `logger.` outside `lib/waitlist/log.ts`; `x-forwarded-for|x-real-ip` appears only in `lib/waitlist/rateKey.ts`; no `"use client"` file names `join_waitlist`/`waitlist_rate_hit` (already covered by REPO-16).
6. `scripts/v2-catalog-probes.test.ts:30-51`: counts 30 → 32, 5 → 6, S 18 → 20; add `147` function assertions; a seeded-violation case for a waitlist function granted to `authenticated`.
7. `scripts/lib/delete-account-coverage.mjs`: **no change** (A.3); add one comment line recording that `waitlist_signups` is intentionally outside account deletion.

---

## F. Runbook (SQL as text; run by Lolo/CTO in the Supabase SQL editor or `psql`, never by the app)

**F.1 Count signups**
```sql
SELECT count(*) AS total FROM public.waitlist_signups;
SELECT locale, count(*) FROM public.waitlist_signups GROUP BY locale ORDER BY 2 DESC;
SELECT date_trunc('day', created_at) AS day, count(*)
FROM public.waitlist_signups GROUP BY 1 ORDER BY 1 DESC LIMIT 30;
-- spike / junk detection: signups per hour, last 48 h
SELECT date_trunc('hour', created_at) AS hour, count(*)
FROM public.waitlist_signups WHERE created_at > now() - interval '48 hours'
GROUP BY 1 ORDER BY 1 DESC;
```

**F.2 Remove one person on request.** Verify the request really comes from that address first (reply from it, or a message to `CONTACT_EMAIL`). Then, in one transaction:
```sql
BEGIN;
DELETE FROM public.waitlist_signups
WHERE email_normalized = normalize(lower(regexp_replace('<address as typed>', '^\s+|\s+$', '', 'g')), NFKC)
RETURNING id, created_at;          -- expect exactly 1 row (0 = not on the list)
COMMIT;                            -- ROLLBACK if the row count is not what you expect
```
Reply to the person once it is done. There is nothing else to purge: no logs, no other tables, no analytics (the rate-limit table holds no address).

**F.3 Export the list** (store the file privately, delete it after use; it is personal data):
```sql
-- psql
\copy (SELECT email, locale, notice_version, created_at FROM public.waitlist_signups ORDER BY created_at) TO 'waitlist.csv' CSV HEADER
-- not yet notified only
\copy (SELECT email, locale FROM public.waitlist_signups WHERE notified_at IS NULL ORDER BY created_at) TO 'to-notify.csv' CSV HEADER
```
Spreadsheet note: an address can legally start with `=`, `+`, `-` or `@`; open the CSV as text, not by double-click (formula injection).

**F.4 Mark notified** (future mailing task; shown for completeness):
```sql
UPDATE public.waitlist_signups SET notified_at = now() WHERE notified_at IS NULL AND email_normalized = ANY (ARRAY['…']);
```

**F.5 Rate-limit table**
```sql
SELECT count(*), min(window_start), max(window_start) FROM public.waitlist_rate_limits;
DELETE FROM public.waitlist_rate_limits;   -- always safe; users are only counted again from zero
```

---

## G. Rollback notes (text, not a migration)

- **First, instant, no DB change:** unset `WAITLIST_ENABLED` (or set it to anything but `1`) in Vercel production and redeploy. The form disappears and the route returns 404. Data stays.
- **Reverting the PR does not unapply 147.** Merge == apply, so a git revert leaves the objects in the database and desynchronises the ledger from the files. Removing the feature from the database needs a **new forward migration** (e.g. `148_v2_waitlist_rollback.sql`), which is itself a merge == apply change and needs the same CTO audit. Never edit or delete 147 after it is applied.
- **Rollback SQL for that migration (text only):**
```sql
-- 1. export first (F.3): this destroys collected e-mails
DROP FUNCTION IF EXISTS public.join_waitlist(text, text, text);
DROP FUNCTION IF EXISTS public.waitlist_rate_hit(text, integer, integer);
DROP TABLE IF EXISTS public.waitlist_rate_limits;
DROP TABLE IF EXISTS public.waitlist_signups;
```
- Order: disable the flag → deploy a route that no longer calls the RPC (or keep it returning 404) → drop. Dropping before the route is off makes every signup attempt a 500.
- The same PR that adds 148 must remove `147_v2_waitlist.sql` from `V2_TABLE_MIGRATIONS`/`V2_FUNCTION_MIGRATIONS` and the REPO-15/16/20 entries, or DB-20/21 fail on a missing object.
- Partial failure of 147 on apply: a failed migration rolls back as a unit (single transaction); the Supabase check fails and nothing is created. The dry run in E.1 is what makes this unlikely.

---

## H. Manual steps for Lolo (exact names)

| # | Where | Name | Value | When |
|---|---|---|---|---|
| 1 | Vercel → Project → Settings → Environment Variables | `RATE_LIMIT_PEPPER` | random secret ≥ 32 bytes, e.g. `openssl rand -base64 48`; **Production** and **Preview** each get their own; mark Sensitive; **not** `NEXT_PUBLIC_*` | **Before** IMPL-3 is deployed. Without it the route returns 500 in production by design. Also add to local `.env.local` (any value) |
| 2 | same | `SUPABASE_SECRET_KEY` | already required by `lib/supabase/service.ts:12` | confirm it exists for Production and Preview (existing routes depend on it) |
| 3 | same | `WAITLIST_ENABLED` | `1` | **only at launch**, Production. Leave unset until the privacy notice and copy are approved. Remember that Vercel *Preview* deployments also run with `NODE_ENV=production`: set `1` on Preview only if you want to test there |
| 4 | Supabase | none | the migration applies on merge via the GitHub integration | after the migration PR merges, check the "Supabase Preview" check on the merge commit, then run `node scripts/check-invariants-001.mjs` locally (with the LIKED `DATABASE_URL`) to see DB-7, DB-20, DB-21 pass |
| 5 | Vercel → Project → Firewall → Custom Rules (optional layer, **availability depends on your plan, UNVERIFIED**) | rule name `waitlist-rate-limit` | **If** path equals `/api/waitlist` **and** method equals `POST` → **Rate limit**: 30 requests per 60 s, key = IP address, on exceed = 429 (deny). Save and publish the change | after launch, any time. Intentionally looser than the app limit (10 per 600 s): it is a flood shield, the app limiter is the precise one |
| 6 | Legal copy (task A notice) | n/a | notice must state: e-mail + language + notice version stored; purpose (beta invitation); retention "until you ask us to remove it"; removal by writing to `CONTACT_EMAIL`; that deleting a LIKED account does not automatically remove a waitlist entry; the keyed rate-limit fingerprint (D.4); that the host and database providers process the data | before `WAITLIST_ENABLED=1`. PR #43 was held because claims did not match the implementation: do not claim "no IP" |
| 7 | After the first production signup | n/a | submit one test address, confirm the row with F.1, delete it with F.2 | smoke test, once |

---

## I. Risks and UNVERIFIED items

**UNVERIFIED (could not be confirmed this session)**

1. **Live LIKED database was not queried.** The credentials available in this session point to a different Supabase project (`gzvixlvkwjsrtmtybtkf`; the repo's own scripts abort unless the URL contains `lzkzfqshnjvlzosnntfx`, `check-invariants-001.mjs:52-56`, and `docs/00_PROGRESS.md` PLAN-CLASSIFY-001 notes the same mismatch). I did not use them. So these rest on repo documents only: ledger max = 146 recorded; `rate_limits`/`rl_hit` live; no existing object named `waitlist_signups`, `waitlist_rate_limits`, `join_waitlist`, `waitlist_rate_hit` (a clash would make the migration fail on merge; the harness catches it); `search_path`/ACL state of 142–146.
2. Live PostgreSQL version and encoding: `normalize(..., NFKC)` needs ≥ 13 and UTF-8. It works on the local PostgreSQL 16.15 used for the dry run (B), but the live version was not queried; harness case DB-12 decides.
3. `pg_cron` availability or any scheduler for a TTL backstop.
4. Vercel: that `x-forwarded-for`/`x-real-ip` cannot be spoofed by clients; the project's Vercel plan and whether the firewall rate-limit rule is available; log-drain/retention settings; `RATE_LIMIT_PEPPER` and `WAITLIST_ENABLED` already present or not.
5. Next.js 16 route-handler specifics (`node_modules` was not installed for this docs-only task; `CLAUDE.md` says to read `node_modules/next/dist/docs/` before writing code): the IMPL-3 author must do so; nothing in this plan depends on an API that changed, but it is not proven.
6. Task A's real files: constants location, enabled helper, stub shape, form handling of 404/429/non-JSON (A.6).
7. That the Supabase GitHub integration still applies on merge exactly as recorded for PR #38.
8. Whether the implementation agent has LIKED production database access to run the rollback harness. If not, the CTO or Lolo must run it before merging IMPL-1.

**Risks**

| # | Risk | Severity | Mitigation / stance |
|---|---|---|---|
| R1 | Migration PR is merge == apply to production | High | plan-only task; CTO audits the DDL; rollback harness (E.1) run before merge; forward-only rollback (G) |
| R2 | PostgREST error `details` contain the failing row = the e-mail | High | C.5/C.6: only SQLSTATE code is used; closed-union logger; canary-e-mail log test |
| R3 | No e-mail verification in v1: the list holds **unverified** addresses; anyone can sign up someone else | Medium now, High at mailing time | v1 sends nothing, so no harm today. **Do not mail the list without a double opt-in step**; a mailing without it creates GDPR/anti-spam exposure. Out of scope here; planned as a separate task (J, IMPL-6) |
| R4 | Spam/junk fills the table (no CAPTCHA, honeypot only beats naive bots; per-IP limit beaten by rotating IPs) | Medium | accepted for v1 per spec; monitor with F.1; optional WAF rule; CAPTCHA is a v2 decision |
| R5 | IP spoofing defeats the per-IP limit if headers are client-controlled | Medium | UNVERIFIED claim (item 4); remaining layers stay |
| R6 | Shared NAT (campus, carrier) throttles real people at 10 per 10 min | Low | window/limit are constants; raise if seen |
| R7 | Hashed IP is pseudonymous personal data | Medium (legal) | keyed hash, ≤ ~1 h retention, disclosed in the notice (D.4, H.6); fail closed without pepper |
| R8 | `delete_account` does not purge waitlist rows | Low–Medium | by spec; disclosed in notice; runbook F.2. **Decision for CTO:** if wanted, add `DELETE FROM waitlist_signups WHERE email_normalized = normalize(lower(p_email), NFKC)` to a future `delete_account` revision (frozen migration 146 means a new migration) |
| R9 | Rate-limit rows persist after the last request until the next call | Low | bounded by distinct IPs in the last hour; runbook purge; optional scheduler (D.4) |
| R10 | Locale list lives in three places (CHECK, function, `LANGUAGES`) | Low | drift test (E.2); adding a language needs a migration |
| R11 | An e2e test submitting a valid e-mail would write to production | Medium | forbidden (E.2) |
| R12 | A route/DB regex mismatch turns a valid-looking e-mail into a 400/500 | Low | route stricter than DB; subset test (E.2) |
| R13 | 404/500 additions to the spec's response matrix | Low | needed; documented in C.3 |
| R14 | Vercel Preview runs with `NODE_ENV=production`, so the "production only" flag also hides the form on previews | Low | H.3 |
| R15 | Fixed-window limiter allows up to 2× burst at a boundary | Low | accepted |
| R16 | `logger` is a no-op in production, so unexpected failures would be invisible | Medium | dedicated `console`-based fixed-event log (C.6.1) |

---

## J. Proposed task breakdown for the implementation

Thinking levels are suggestions for the coder (lowest that is safe).

| ID | Title | Depends on | Content | CTO audit before merge? | Coder thinking |
|---|---|---|---|---|---|
| **V2-LANDING-002-B-IMPL-1** | Migration 147 + rollback harness | this plan approved; CTO sign-off on B | `supabase/migrations/147_v2_waitlist.sql` (exactly section B) and `scripts/verify-waitlist-147.mjs` (E.1). **Nothing else**: no Tier-0 edits, no app code. Run the harness against LIKED and attach the output | **YES, mandatory.** merge == apply. CTO reads the SQL line by line, checks harness output (all PASS, zero residue), then merges. Not auto-merged | HIGH |
| **V2-LANDING-002-B-IMPL-2** | Post-apply: verification, types, Tier-0 | IMPL-1 merged and applied | confirm ledger row 147; `node scripts/check-invariants-001.mjs` and `verify-v2-security.mjs`; regenerate `lib/types/database.ts` (`scripts/generate-types.ts`); Tier-0/test changes of E.3; PROGRESS row | No (ordinary review); runs read-only checks | MEDIUM |
| **V2-LANDING-002-B-IMPL-3** | Route, validation, rate key, logger, tests | IMPL-2; **task A merged** | `app/api/waitlist/route.ts` replacing the stub, `lib/waitlist/{validate,rateKey,log}.ts`, vitest of E.2, minimal e2e. Reuses A's constants and enabled helper. Reads `node_modules/next/dist/docs/` first | Recommended CTO skim of the logging path (R2); not blocking | MEDIUM |
| **V2-LANDING-002-B-IMPL-4** | Launch checklist | IMPL-3 deployed; copy approved | Lolo steps H.1-H.7: `RATE_LIMIT_PEPPER`, optional firewall rule, notice check, `WAITLIST_ENABLED=1`, smoke test, deletion of the test row | n/a (manual) | LOW |
| **V2-LANDING-002-B-IMPL-5** (optional) | TTL backstop / housekeeping | `/api/cron/housekeeping` shipped, or scheduler decision | fold `waitlist_rate_limits` purge into `housekeeping_purge` or add a cron; possible migration → CTO-audited | **YES if it touches SQL** | MEDIUM |
| **V2-LANDING-002-B-IMPL-6** (future, out of scope) | Double opt-in confirmation + mailing | decision on mail provider | confirmation e-mail, unsubscribe, `notified_at` use | YES (new migration + e-mail) | HIGH |

Order: IMPL-1 → (CTO merge, apply) → IMPL-2 → IMPL-3 (also needs A) → IMPL-4. A typed `.rpc("join_waitlist")` does not compile before IMPL-2 regenerates the types, which is why types come before the route.

**Decisions requested from the CTO before IMPL-1:** (1) accept option (c) for rate limiting (D.2); (2) confirm `RETURNS void` (B); (3) confirm first-signup-wins on duplicates; (4) confirm that `delete_account` stays untouched (R8); (5) confirm that Tier-0 edits go in IMPL-2, after the apply, rather than in the migration PR.

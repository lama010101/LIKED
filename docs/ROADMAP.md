# LIKED — Implementation Roadmap

**Version:** 2026-08-09  
**Audience:** Cascade / Devin agent  
**Authoritative docs:** `01_PRD.md` v27.2, `02_BUILD_PLAN.md` v1.0, `04_FEED_SQL_SPEC.md` v1.0, `00_PROGRESS.md`, `AUDIT-01-REPORT.md`

---

## 1. Current state (verified 2026-08-09)

| Check | Result |
|-------|--------|
| `npm run build` | ✅ pass |
| `npx tsc --noEmit` | ✅ pass |
| `npm run lint` | ⚠️ 70 warnings, 0 errors |
| `npm audit` | ✅ 0 vulnerabilities |
| Vercel `liked` + `liked-ppa7` deployments | ✅ pass |
| Unauthenticated pages (`/login`, `/signup`, `/feed` redirect) | ✅ render, no 500/JS errors |
| Authenticated `/feed` | ❌ runtime 500 because the Supabase project behind `NEXT_PUBLIC_SUPABASE_URL` is missing the LIKED schema, specifically `public.get_feed(...)` |

### Immediate blockers

1. **Supabase project / migration gap.** The env `SUPABASE_DB_CONNECTION` points to a `public` schema that contains `GH-NEW2` tables (`sessions`, `events`, `players`, …), not the LIKED schema. The Vercel preview (`liked-ppa7`) and local dev will fail at runtime until the LIKED migrations are applied to the project that matches `NEXT_PUBLIC_SUPABASE_URL` (`https://gzvixlvkwjsrtmtybtkf.supabase.co`).
2. **70 ESLint warnings.** Mostly unused variables, missing hook dependencies, and `<img>` vs `<Image />`. Not build-breaking but must be cleaned before declaring P1–P9 gate-complete.
3. **Remaining audit hardening.** `AUDIT-01-REPORT.md` items `H4` and `H5` (and the related `P0` tasks) are still not fully closed in `00_PROGRESS.md`.
4. **Next.js deprecation warning.** `middleware.ts` convention is deprecated in Next.js 16.3.0; the app still builds, but a migration to the `proxy` convention is required for long-term support.

---

## 2. Roadmap philosophy

- **Phase order is mandatory** per `02_BUILD_PLAN.md` §HOW TO USE THIS DOCUMENT.
- Every write goes through the canonical cause → edge path.
- Feed logic stays inside `get_feed`; no client-side filtering, sorting, or pagination.
- One task per session, one file/function per change, full `tsc`/`lint`/`build` verification before each commit.

---

## 3. Phase 0 — Unblock runtime (prerequisite for everything)

**Goal:** Make the authenticated feed load so the rest of the app can be exercised and tested.

### 0-T01 — Resolve Supabase project mismatch
- Verify which Supabase project `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` belong to.
- Provide a `SUPABASE_DB_CONNECTION` string for that same project (or install `supabase` CLI and run `supabase db push` / `supabase migrations up`).
- Apply **all** migrations under `supabase/migrations/` to the correct project in numeric order.
- Confirm `public.get_feed(...)` exists and returns rows with the seed data.

**Acceptance:**
- Local `npm run dev` → sign up → `/feed` loads without `get_feed` 500.
- Vercel `liked-ppa7` preview → sign up → `/feed` loads.

### 0-T02 — Seed data verification
- Confirm seed users/nodes/folders are present or re-run `P1-T05` seed.
- Verify at least one node is visible to a test user so the golden-path smoke test can pass.

**Acceptance:**
- E2E smoke test: create user, create node, node appears in feed.

---

## 4. Phase 1 — Warning and hardening cleanup

**Goal:** Get the codebase to a zero-warning, zero-critical-hardening state before adding new features.

### 1-T01 — Clean ESLint warnings (70)
Categories from `npm run lint`:
- `no-unused-vars` (imports/variables)
- `react-hooks/exhaustive-deps` (`useCallback`/`useMemo`/`useEffect` deps)
- `@next/next/no-img-element` (replace `<img>` with Next `<Image />` where appropriate)
- `@next/next/no-page-custom-font` (move Google Fonts import to root layout metadata or CSS)

**Acceptance:** `npm run lint` → `0 problems (0 errors, 0 warnings)`.

### 1-T02 — Close audit H4/H5 (remaining write-authority gaps)
From `AUDIT-01-REPORT.md` and `P0`:
- **H4:** `create_node` / `create_node_with_metadata` are `SECURITY INVOKER`; per `03_TECHNICAL_ARCHITECTURE.md` §7 they must be `SECURITY DEFINER`.
  - Migration: `ALTER FUNCTION ... OWNER TO ...` / recreate as `SECURITY DEFINER`.
  - Verify caller's `auth.uid()` is used only inside the function, not in the TS wrapper.
- **H5:** The four folder write paths that still bypass RPCs:
  - `addNodeToFolder`
  - `removeNodeFromFolder`
  - `deleteFolder`
  - `moveFolder`
  - Implement (or complete) the DB RPCs and route all TS calls through `lib/db/rpc.ts` or `supabase.rpc`.

**Acceptance:**
- Grep `.from("folder_edges").` / `.from("folders").update` / `.from("folders").delete` shows only read-only helpers (or the explicitly approved `hardDeleteNode` path).
- `npx tsc --noEmit` and `npm run build` still pass.

### 1-T03 — Migrate `middleware.ts` to Next.js `proxy` convention
- Follow `https://nextjs.org/docs/messages/middleware-to-proxy`.
- Rename / restructure `middleware.ts` to the `proxy` API while preserving auth-guard behavior.

**Acceptance:** `npm run build` passes with zero `middleware` deprecation warnings.

### 1-T04 — Dependency hygiene
- Fix the bogus `dotenv` version in `package.json` (`^17.4.2` does not exist; latest stable is 16.x). Re-install and verify `package-lock.json`.

**Acceptance:** `npm ci` or `npm install` succeeds with no invalid-version warnings.

---

## 5. Phase 2 — Realtime & Notifications (P10)

**Goal:** PRD §22, §23, §25, §26, §32.5

### 2-T01 — Supabase Realtime subscriptions (P10-T01)
- Recreate `lib/hooks/useRealtime.ts` (deleted during audit cleanup).
- Subscribe to postgres changes on:
  - `edges` INSERT for `user_id = current user`
  - `notifications` INSERT for current user
  - `ratings` INSERT/UPDATE for nodes in feed
  - `users` UPDATE for visible users
  - `nodes` UPDATE for visible nodes
- Clean up subscriptions on unmount.
- Wire into `layout.tsx` or a dedicated `RealtimeProvider`.

**Acceptance:**
- Receive a share from another user/session → new card appears in feed without refresh.
- Rating change updates card `avg_rating` badge in real time.
- Profile display-name/avatar change updates all visible cards.

### 2-T02 — Notification bell and notification view (P10-T02)
- Bell icon with unread count badge in `TopBar.tsx`.
- Dropdown/panel listing `notifications` for current user, newest first.
- Types: `new share`, `group membership change`, `folder share`.
- Mark one as read on click; `Mark all read` button for bulk update.
- Badge clears when all read.

**Acceptance:**
- Bell count matches unread `notifications` rows.
- Clicking a notification marks it read and navigates to the relevant context.

### 2-T03 — Activity log writes
- Ensure all server actions that mutate state write an `activity_log` row (P8 metadata extraction already does this; extend to shares, folder ops, ratings, trash).

**Acceptance:** `activity_log` reflects user actions with correct `action`, `actor_id`, and `metadata`.

---

## 6. Phase 3 — Advanced Views & Multilingual (P11)

**Goal:** PRD §11.2 E, §11.2 D, §33

### 3-T01 — Infinite canvas polish (P11-T01)
- Re-enable `FreeGrid` (currently the canvas view).
- Persist card positions to `user_node_preferences` (or a new `canvas_positions` table if required by spec).
- Pan with mouse/touch drag. **Do not implement pinch-to-zoom.**
- Folder chips open a sub-canvas.
- Auto-arrange button.
- All DnD, multi-select, and context actions must work in canvas mode.

**Acceptance:**
- Drag a card in canvas view, refresh, card is in the new position.
- Click a folder chip in canvas view → view zooms to that folder's collection.
- Auto-arrange produces a tidy grid.

### 3-T02 — Horizontal rows polish (P11 part of P5-T03 + P11)
- Complete `HorizView.tsx` sub-folder grouping (currently a stub per `AUDIT-01/M4`).
- Group by `folder_edges` or `parent_folder_id` as appropriate.

**Acceptance:** Horizontal row view groups cards by folder/sub-folder correctly.

### 3-T03 — Multilingual support (P11-T02)
- Language selector in `ProfileModal` (`en`, `fr`, `th`).
- Store `users.language_code`.
- Title/description fallback chain: user language → node language → `nodes.title`.
- Tag label fallback chain: user language → `en` → tag_id suffix.
- `extract-node-metadata` Edge Function must store `language_code` on the node.
- Seed `translations` rows for French and Thai to test fallback.

**Acceptance:**
- Change language in Profile Modal → displayed content updates without reload.
- Missing translation falls back through the chain.
- No runtime calls to external translation APIs.

---

## 7. Phase 4 — Admin & Permissions (P12)

**Goal:** PRD §21, §17.2

### 4-T01 — Admin grant and capabilities (P12-T01)
- Implement `grantFolderAdmin` and `grantGroupAdmin` RPCs (or server actions).
- Enforce server-side checks:
  - Only folder owner or existing admin can grant.
  - Only group owner or existing admin can grant.
- Admin capabilities:
  - Folder admin: rename, add/remove nodes, share/unshare, grant admin.
  - Group admin: rename, add/remove members, share nodes, delete group.
- UI: `MultiSelectContextMenu` shows `Give admin rights` when a folder/group context is active.
- UI: member list in folder/group detail with admin toggle.

**Acceptance:**
- Non-admin cannot perform admin actions (blocked server-side, not just UI).
- Admin grant works via long-press menu and member list.

---

## 8. Phase 5 — Chat (P13)

**Goal:** PRD §28

### 5-T01 — Direct chat and group chat
- Activate existing tables: `direct_chats`, `messages`, `group_messages`.
- Implement chat UI panel (from PRD §28).
- Real-time messages via Supabase Realtime.
- Link `node_messages` to card detail context.

**Acceptance:**
- P1–P12 gate conditions all pass before starting (per PRD §28).
- Users can send/receive direct and group messages.
- Messages appear in real time.

---

## 9. Phase 6 — Final validation & release

### 6-T01 — PRD §39 / §30 checklist
- Walk through every item in `01_PRD.md` §39 validation checklist.
- Run full E2E suite on `liked-ppa7` preview.
- Fix any regression.

### 6-T02 — Performance & security pass
- Review RLS policies on all new tables/functions.
- Confirm all writes are atomic and cause → edge compliant.
- Verify no `SECURITY INVOKER` functions perform writes.
- Run `npm audit` and `npm update` as needed.

### 6-T03 — Merge audit PR and cut release
- Merge PR #1 (`devin/20260809-audit-fixes`) if not already merged.
- Open/merge follow-up PRs for each phase above.

---

## 10. Suggested first next step

Start with **0-T01**: provide the correct Supabase project connection and run `supabase db push` (or apply migrations via `psql`) for the project behind `NEXT_PUBLIC_SUPABASE_URL`. Until the schema is present, no authenticated feature can be validated, and every subsequent phase is blocked at runtime.

Once 0-T01 is done, proceed to **1-T01** (ESLint warnings) and **1-T02** (H4/H5 hardening) in parallel, then move through P10 → P11 → P12 → P13.

# LIKED — Chrome Extension Atomic Implementation Plan

**Version:** 2.0  
**Status:** PROPOSED / READY FOR EXECUTION  
**Companion to:** `docs/01_PRD.md`, `docs/03_TECHNICAL_ARCHITECTURE.md`, `docs/04_FEED_SQL_SPEC.md`, `docs/06_CHROME_EXTENSION_PRD.md`

---

## Authority & Invariants

This plan is subordinate to the existing LIKED architecture and to `docs/06_CHROME_EXTENSION_PRD.md`. These invariants are non-negotiable for every task:

* **Visibility = `edges` only.** The extension never computes, stores, or hints at feed visibility.
* **Feed = `get_feed()` only.** The extension implements no feed, sort, filter, dedup, or pagination logic.
* **Writes = `cause` → `node` → `edge` in one transaction.** The extension never writes `causes`, `edges`, `folder_edges`, `tag_edges`, or `node_notes` directly.
* **Nodes = content source of truth.** The extension sends only `url` + optional user metadata; canonical metadata extraction stays on the backend.
* **No database credentials in the extension.** All persistence goes through authenticated HTTPS API calls.
* **Manifest V3, minimal permissions.** Target `activeTab` + `storage`. No `history`, `tabs`, `webRequest`, or `cookies` unless explicitly justified.

---

## Deliverables

### A. Updated PRD

Saved as `docs/06_CHROME_EXTENSION_PRD.md`. New or expanded sections:

* Product Direction, Core Value Proposition, Product Philosophy
* Extension Core Workflow (YouTube focus)
* Save UX, Collections, Tags, Personal Notes
* Search & Rediscovery, Creator Workflow
* AI-Assisted Organization, Library UI
* Extension ↔ Web App Relationship
* MVP Priority P0/P1/P2
* Duplicate Handling, Generic Web Content
* Data Model & Sources of Truth, API Contract, Security, Non-Goals, Open Questions

### B. Updated Implementation Plan

This document. It preserves the atomic implementation approach from v1.0 but updates priorities, schema, API, extension UI, and testing to match the v2.0 product direction.

### C. Database Changes

1. **`nodes.source_type` TEXT nullable**  
   Distinguish content kinds: `youtube`, `webpage`, `text`, etc. Keeps `nodes` generic and extensible.

2. **`nodes.source_meta` JSONB nullable**  
   Source-specific metadata: `video_id`, `channel_id`, `channel_name`, `site_name`, `published_at`. Avoids per-source columns.

3. **New `node_notes` table** for personal notes:

   ```
   id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
   node_id       UUID NOT NULL REFERENCES nodes(id) ON DELETE CASCADE
   user_id       UUID NOT NULL REFERENCES users(id)
   note_text     TEXT NOT NULL
   created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
   UNIQUE(node_id, user_id)
   ```

4. **Extend `create_node_with_metadata` RPC** with optional parameters:
   * `p_source_type TEXT`
   * `p_source_meta JSONB`
   * `p_description TEXT`
   * `p_external_id TEXT`
   * Insert a `translations` row for `(node_id, p_language_code)` when `p_description` is supplied or when a translation title should be pre-seeded.

5. **New `import_url` RPC** — the single import authority for the extension:
   * Validate URL.
   * Canonicalize YouTube URLs to a bare `watch?v=VIDEO_ID` form for deduplication.
   * Check for existing active node by `(owner_id, canonical_url)`.
   * Resolve `external_sources.id` for `chrome_extension`.
   * Call `create_node_with_metadata` to create `cause` (type `import`), `node`, `edge` (depth 0, direction `sent`), `nodes_sort_cache`, and auto-tags from suggested labels.
   * Add `folder_edges` when `p_folder_id` is provided and the user has `contribute` permission.
   * Add `tag_edges` for existing `tag_ids` and create new tags for `new_tag_labels` using the existing deterministic tag process.
   * Insert `node_notes` when a personal note is provided.
   * Insert `external_items_map` provenance row.
   * Return `{ node_id UUID, already_exists BOOLEAN }`.

6. **Update `get_feed` and `search_nodes`** to include:
   * `node_notes.note_text` in keyword search (owner-only notes).
   * `nodes.source_meta->>'channel_name'` in keyword search for channel search.
   * Optional `has_note` / `source_meta` output columns for card rendering.

7. **Seed `external_sources`** with a stable `chrome_extension` row (idempotent).

8. **Indexes** as required for `node_notes`, `source_meta` search, and any new generated columns.

9. **Regenerate `lib/types/database.ts`** after migrations are applied.

### D. Chrome Extension Changes

* `extension/manifest.json` — Manifest V3, permissions `activeTab` and `storage`, icons, action popup, background service worker, `externally_connectable` to the LIKED host.
* `extension/src/background/service-worker.ts` — listen for `chrome.runtime.onMessageExternal` auth messages, store session in `chrome.storage.local`; no history monitoring, no background sync, no feed polling.
* `extension/src/auth/session.ts` — Supabase client backed by `chrome.storage.local`; helpers `getSession`, `isAuthenticated`, `signOut`, `signIn`.
* `extension/src/api/liked-client.ts` — typed `fetch` wrapper for `/api/import`, `/api/extension/folders`, `/api/extension/tags`; bearer token auth; error normalization.
* `extension/src/popup/popup.html`, `popup.ts`, `popup.css` — popup UI:
  * unauthenticated sign-in CTA
  * authenticated active tab preview (title, URL, favicon)
  * quick save → “Saved ✓”
  * expanded optional collection picker, tag chips, note textarea
  * duplicate state with “Open in LIKED”
  * error states from PRD §21
* `extension/public/icons/` — 16, 32, 48, 128 PNG icons.
* `extension/package.json`, `tsconfig.json` — extension build; root `package.json` scripts `build:extension` and `dev:extension`.
* `extension/README.md` — build and load instructions.

### E. API Changes

* `POST /api/import` — extension mutation orchestrator:
  * Bearer token authentication.
  * Validate URL.
  * Call `extract-node-metadata` Edge Function with client metadata fallbacks; 10-second timeout.
  * Merge Edge Function output and client metadata.
  * Call `import_url` RPC.
  * Return `{ success, nodeId, alreadyExists }` or typed error.

* `GET /api/extension/folders` — folder picker data:
  * Bearer token authentication.
  * Return `{ id, name, parentFolderId, colorHex, isProject }[]`.

* `GET /api/extension/tags` — tag picker data:
  * Bearer token authentication.
  * Return `{ id, label, colorHex }[]` in the user's language.

* `app/extension/auth/page.tsx` — web auth relay:
  * If unauthenticated, show sign-in link to `/login?redirect=/extension/auth`.
  * If authenticated, send `LIKED_SESSION` message to the extension and close the tab.

* CORS headers on all extension routes to allow `chrome-extension://` origin.

### F. UI Changes

**Web app library:**

* `components/cards/NodeCard.tsx` — show note indicator, source/channel subtitle, collection chips, tag chips.
* `components/modals/CardDetailSheet.tsx` — display personal note, source metadata, channel, “Open on YouTube” primary CTA.
* `components/sheets/AddCardSheet.tsx` — add optional note textarea, source preview, source-type badge.
* `components/feed/FeedContainer.tsx` / `FeedGrid.tsx` — grid/list view toggle, sort by date/title/channel/source.
* `app/(app)/feed/page.tsx` — accept and pass source filters if implemented.
* `lib/hooks/useFeed.ts` — consume optional `source_meta` / `has_note` from `get_feed` output for card rendering.

**Extension popup:**

* As described in D.

### G. Testing Plan

| Test Area | Scope | Method |
|---|---|---|
| Unit | URL parsing, YouTube ID extraction, `source_type` detection | Jest/Vitest in `extension/` and `lib/` |
| Integration | `import_url` duplicate detection, folder/tag/note writes | Supabase local test DB + migration |
| API | `/api/import`, `/api/extension/folders`, `/api/extension/tags` | `curl`/Playwright against local dev server |
| Extension | Popup render, auth flow, save flow, duplicate state, offline error | Manual Chrome load-unpacked + Playwright extension automation |
| Metadata extraction | YouTube oEmbed/page parse, generic Open Graph, fallbacks | Edge Function unit tests with fixtures |
| Duplicate save | Same YouTube ID via different URL variants; same user vs different users | RPC integration tests |
| Authentication | Token expiry, invalid token, sign-out | API + extension tests |
| Search | Keyword search in title, tags, notes, channel | `get_feed` / `search_nodes` integration |
| Offline / error | Network failure, invalid URL, 5xx | Extension manual + API mocks |
| Security | Manifest permissions, no DB secrets in bundle, HTTPS only | Static audit + Chrome policy check |

### H. Open Questions

1. Should the popup permit creating a new collection directly, or only select existing collections in P0?
2. On duplicate, should the backend automatically merge new collection/tag/note choices, or only return `alreadyExists` and let the user open the web app?
3. Should the canonical YouTube URL be displayed in the popup, or should the original URL be preserved in `nodes.url` while a separate `canonical_url` is used for deduplication?
4. Should `node_notes` support multiple notes per node per user, or exactly one note per node per user?
5. Should AI-suggested tags/summary be fetched from `extract-node-metadata` in P0 as optional hints, or hidden until P2?

---

## Phased Execution

### Phase 0 — Schema & Import Authority

**Goal:** the database can support the v2.0 capture loop.

| Task | Files | Acceptance |
|---|---|---|
| 0.1 Add `nodes.source_type` and `nodes.source_meta` | `supabase/migrations/044_extension_metadata.sql` | Columns exist, nullable, indexed for search where needed |
| 0.2 Create `node_notes` table | `supabase/migrations/044_extension_metadata.sql` | Table, FK, unique `(node_id, user_id)`, indexes |
| 0.3 Extend `create_node_with_metadata` | `supabase/migrations/045_extend_create_node.sql` | Accepts new params, inserts `translations` row when description supplied, returns same columns |
| 0.4 Create `import_url` RPC | `supabase/migrations/046_import_url_rpc.sql` | Atomic, deduplicates, returns `already_exists`, creates cause/node/edge/folder/tag/note/external provenance |
| 0.5 Seed `chrome_extension` external source | `supabase/migrations/046_import_url_rpc.sql` or seed script | `SELECT id FROM external_sources WHERE name = 'chrome_extension'` returns stable UUID |
| 0.6 Update `get_feed` / `search_nodes` for notes and channel | `supabase/migrations/047_search_notes_channel.sql` | Keyword search includes `node_notes` and `source_meta` channel; output includes `has_note`/`source_meta` if needed |
| 0.7 Regenerate `lib/types/database.ts` | `lib/types/database.ts` | Matches migrated schema; `npm run build` / `npx tsc --noEmit` pass |

### Phase 1 — Edge Function Enhancements

**Goal:** `extract-node-metadata` returns the metadata required for the v2.0 contract.

| Task | Files | Acceptance |
|---|---|---|
| 1.1 Detect source type | `supabase/functions/extract-node-metadata/index.ts` | Returns `source_type: 'youtube' \| 'webpage' \| 'text'` |
| 1.2 Extract YouTube metadata | same | Returns `video_id`, `channel_name`, `channel_id` when available |
| 1.3 Return canonical URL and external ID | same | Returns `canonical_url` and `external_id` (video ID or normalized URL) |
| 1.4 Return `source_meta` | same | Returns JSON object with channel/source metadata |
| 1.5 Keep existing contract | same | `title`, `description`, `thumbnail_key`, `language_code`, `suggested_tags`, `og_data` still returned |

### Phase 2 — API Routes

**Goal:** the extension has authenticated HTTPS endpoints.

| Task | Files | Acceptance |
|---|---|---|
| 2.1 Token-aware Supabase helper | `lib/supabase/server.ts` or `lib/supabase/token.ts` | Returns user from `Authorization: Bearer <token>` header |
| 2.2 `POST /api/import` | `app/api/import/route.ts`, optional `lib/db/import.ts` | Returns `{ success, nodeId, alreadyExists }` or typed error; CORS headers |
| 2.3 `GET /api/extension/folders` | `app/api/extension/folders/route.ts` | Returns folder tree with parent/color/project |
| 2.4 `GET /api/extension/tags` | `app/api/extension/tags/route.ts` | Returns tags in user language |
| 2.5 Auth relay page | `app/extension/auth/page.tsx` | Sends session to extension and closes tab |
| 2.6 CORS & OPTIONS | all `app/api/extension/*` and `app/api/import/route.ts` | Extension calls succeed without CORS errors |

### Phase 3 — Web App Library UI

**Goal:** users can see, search, and manage captured content.

| Task | Files | Acceptance |
|---|---|---|
| 3.1 NodeCard note/source indicators | `components/cards/NodeCard.tsx` | Shows note indicator, channel/source subtitle, collection/tag chips |
| 3.2 Card detail note/source display | `components/modals/CardDetailSheet.tsx` | Shows personal note, source metadata, “Open on YouTube” CTA |
| 3.3 AddCardSheet note field | `components/sheets/AddCardSheet.tsx` | Optional note textarea, source preview |
| 3.4 Feed grid/list toggle and sort | `components/feed/FeedContainer.tsx`, `FeedGrid.tsx`, `lib/store/filterStore.ts` | Toggle works, sort options include date/title/channel/source |
| 3.5 Feed data shape | `lib/hooks/useFeed.ts`, `lib/db/search.ts` | Handles optional `source_meta` / `has_note` from `get_feed` |

### Phase 4 — Chrome Extension

**Goal:** browser capture surface works end-to-end.

| Task | Files | Acceptance |
|---|---|---|
| 4.1 Manifest and icons | `extension/manifest.json`, `extension/public/icons/*` | Loads unpacked without warnings |
| 4.2 Auth/session module | `extension/src/auth/session.ts` | Sign in/out, session persistence in `chrome.storage.local` |
| 4.3 Service worker | `extension/src/background/service-worker.ts` | Receives `LIKED_SESSION`, no extra permissions |
| 4.4 API client | `extension/src/api/liked-client.ts` | All endpoints use bearer token, HTTPS, typed errors |
| 4.5 Popup HTML/CSS/TS | `extension/src/popup/*` | Quick save, expanded collection/tag/note, duplicate/error states |
| 4.6 Build tooling | `extension/package.json`, `extension/tsconfig.json`, root `package.json` | `npm run build:extension` outputs `extension/dist/` |
| 4.7 README | `extension/README.md` | New developer can build and load the extension |

### Phase 5 — Security, CORS & Build

**Goal:** extension can be loaded and reaches the backend safely.

| Task | Files | Acceptance |
|---|---|---|
| 5.1 Manifest audit | `extension/manifest.json` | Only `activeTab` + `storage`; no `history`/`tabs`/`webRequest`/`cookies` |
| 5.2 CORS on routes | see Phase 2 | `chrome-extension://` origin can call all endpoints |
| 5.3 Environment variables | `.env.local`, `.env.example` | `NEXT_PUBLIC_LIKED_API_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_EXTENSION_ID` documented |
| 5.4 No DB secrets in bundle | audit | No `SUPABASE_SERVICE_ROLE_KEY` in extension source or build output |

### Phase 6 — QA & Deployment

**Goal:** prove the full loop.

| Task | Method | Acceptance |
|---|---|---|
| 6.1 Save a YouTube video from extension | Manual / Playwright | Appears in `/feed` with correct title, thumbnail, channel, collections, tags, note |
| 6.2 Search by note/tag/channel | Web app search | Finds the saved item |
| 6.3 Duplicate save with variant URL | Click extension on `youtu.be/ID` and `youtube.com/watch?v=ID` | Second save returns `alreadyExists` |
| 6.4 Unauthenticated flow | Sign out, open popup | Shows sign-in CTA |
| 6.5 Build & typecheck | `npm run build`, `npx tsc --noEmit`, `npm run lint` | All pass |
| 6.6 Security review checklist | `docs/06_CHROME_EXTENSION_PRD.md` §19 | Manifest passes Chrome policy audit |

---

## Priority Matrix

| Feature | P0 | P1 | P2 |
|---|---|---|---|
| YouTube save | ✅ | | |
| Generic web save | | ✅ | |
| Automatic metadata capture | ✅ | | |
| Collections | ✅ | | |
| Multiple collections per item | ✅ | | |
| Tags | ✅ | | |
| Personal notes | ✅ | | |
| Keyword search | ✅ | | |
| Channel search | ✅* | | |
| Open original URL | ✅ | | |
| Grid/list toggle | ✅ | | |
| Sort by title/channel/source | | ✅ | |
| AI tagging / summary | | | ✅ |
| Transcript indexing | | | ✅ |
| Semantic search | | | ✅ |
| Natural-language queries | | | ✅ |

*Channel search depends on `source_meta` availability; if it adds P0 risk, move to P1.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| YouTube page / oEmbed changes break metadata extraction | Use YouTube oEmbed as primary, page Open Graph as fallback; unit tests with fixtures |
| `get_feed` output changes affect existing cards | Add `source_meta` and `has_note` as new optional output columns; do not rename existing columns |
| Personal notes conflated with page descriptions | Use dedicated `node_notes` for user notes; `translations.description` for page metadata |
| Duplicate import races | Handle `unique_violation` inside `import_url`; never pre-check in the extension |
| Chrome Web Store policy rejects permissions | Keep manifest to `activeTab` + `storage`; document any additional permission with architectural justification |
| AI features leak into P0 scope | Gate all AI work behind explicit P2 tasks; P0 extension never calls AI endpoints |

---

## Notes for the Executor

* Do **not** implement a feed, search engine, sharing, groups, or friend management in the extension.
* Do **not** let the extension create `causes`, `edges`, `folder_edges`, `tag_edges`, or `node_notes` directly.
* All folder, tag, and note writes must be inside the `import_url` transaction.
* The canonical metadata extraction pipeline (`extract-node-metadata` Edge Function) remains the source of truth for node title, description, thumbnail, language, suggested tags, and source metadata.
* When in doubt, the extension only submits user intent: **“Import this URL with these optional attributes.”**
* Preserve working functionality of the existing web app `AddCardSheet` and feed.

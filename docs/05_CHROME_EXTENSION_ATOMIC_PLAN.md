# LIKED — Chrome Extension Atomic Implementation Plan

**Version:** 1.0  
**Status:** PROPOSED / READY FOR EXECUTION  
**Companion to:** `01_PRD.md`, `03_TECHNICAL_ARCHITECTURE.md`, `04_FEED_SQL_SPEC.md`, `02_BUILD_PLAN.md`  
**Scope:** Implement the *LIKED Chrome Extension* PRD as a thin import client over the existing LIKED backend.

---

## Authority & Constraints

This plan is subordinate to the existing LIKED architecture. These invariants are non-negotiable for every task:

* **Visibility = `edges` only.** The extension never computes, stores, or hints at feed visibility.
* **Feed = `get_feed()` only.** The extension implements no feed, sort, filter, dedup, or pagination logic.
* **Writes = `cause` → `node` → `edge` in one transaction.** The extension never writes `causes`, `edges`, `folder_edges`, or `tag_edges` directly.
* **Nodes = content source of truth.** The extension sends only `url` + optional user metadata; canonical metadata extraction stays on the backend.
* **No database credentials in the extension.** All persistence goes through authenticated HTTPS API calls.

---

## Deliverables

1. A new `import_url` Postgres RPC that performs the complete extension import in one atomic transaction.
2. Three new Next.js API routes:
   * `POST /api/import` — the only import mutation path.
   * `GET /api/extension/folders` — the folder picker data.
   * `GET /api/extension/tags` — the tag picker data.
3. A Chrome Extension (Manifest V3) under `extension/`:
   * `manifest.json`
   * `popup/` (HTML / TS / CSS)
   * `background/service-worker.ts`
   * `auth/session.ts`
   * `api/liked-client.ts`
4. A web-app auth relay page at `app/extension/auth/page.tsx`.
5. Updated environment variables and build scripts.

---

## Recommended Extension Architecture

```
extension/
├── src/
│   ├── popup/
│   │   ├── popup.html
│   │   ├── popup.ts
│   │   └── popup.css
│   ├── background/
│   │   └── service-worker.ts
│   ├── auth/
│   │   └── session.ts
│   ├── api/
│   │   └── liked-client.ts
│   └── types/
│       └── index.ts
├── dist/                         # built JS + manifest + icons
├── public/
│   └── icons/                    # 16, 32, 48, 128 PNG
├── manifest.json                 # points at dist/ files
├── package.json
├── tsconfig.json
└── README.md
```

The extension is a pure client of the LIKED Next.js app. It stores only an auth token and the current-tab preview; it has no local LIKED state.

---

## Phase 0 — Backend Import Authority (Database)

### EXT-0.1 — Register the Chrome Extension as an external source

**Goal:** Give the import system a registered `external_sources` identity for the extension.

**Files to touch:**
* `supabase/migrations/043_extension_import.sql`

**Change:**
```sql
INSERT INTO external_sources (name, base_url)
VALUES ('chrome_extension', 'chrome-extension://')
ON CONFLICT (name) DO UPDATE SET base_url = EXCLUDED.base_url;
```

**Acceptance:**
- [ ] `SELECT id FROM external_sources WHERE name = 'chrome_extension'` returns a stable UUID.
- [ ] Migration is idempotent (runs safely on an already-seeded DB).

---

### EXT-0.2 — Extend `create_node_with_metadata` with optional cause metadata

**Goal:** Allow the extension import to write `cause.metadata = { url, source: 'chrome_extension' }` while keeping the existing web creation path unchanged.

**Files to touch:**
* `supabase/migrations/043_extension_import.sql`
* `lib/db/nodes.ts` (only to confirm call signature is unchanged)

**Change:**
Recreate `create_node_with_metadata` with one new optional parameter at the end:

```sql
CREATE OR REPLACE FUNCTION create_node_with_metadata(
  p_owner_id UUID,
  p_url TEXT,
  p_text_content TEXT,
  p_title TEXT,
  p_thumbnail_key TEXT,
  p_language_code TEXT,
  p_tag_labels TEXT[],
  p_cause_metadata JSONB DEFAULT NULL
)
```

Inside the function, replace the existing cause insert with:

```sql
INSERT INTO causes (cause_type, created_by, metadata)
VALUES (
  'import',
  p_owner_id,
  COALESCE(
    p_cause_metadata,
    jsonb_build_object('node_id', v_node_id)
  )
)
```

**Acceptance:**
- [ ] `npm run lint` and `npx tsc --noEmit` pass.
- [ ] Existing `AddCardSheet` URL + text creation still works and produces `causes.metadata = { node_id: ... }`.
- [ ] The new `p_cause_metadata` parameter is accepted when supplied, without changing the return table.

---

### EXT-0.3 — Create the `import_url` atomic import RPC

**Goal:** One transaction that does everything the extension import needs: dedup, node creation, cause + edge creation, folder/tag/description writes, and external-source provenance.

**Files to touch:**
* `supabase/migrations/043_extension_import.sql`

**Suggested signature:**

```sql
CREATE OR REPLACE FUNCTION import_url(
  p_user_id UUID,
  p_url TEXT,
  p_folder_id UUID DEFAULT NULL,
  p_tag_ids UUID[] DEFAULT NULL,
  p_new_tag_labels TEXT[] DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_language_code TEXT DEFAULT 'en',
  p_title TEXT DEFAULT NULL,
  p_thumbnail_key TEXT DEFAULT NULL,
  p_external_source_name TEXT DEFAULT 'chrome_extension',
  p_external_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  node_id UUID,
  already_exists BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
```

**Behavior:**

1. **URL validation** — `p_url` must start with `http://` or `https://`.
2. **Deduplication** — check `nodes` for an existing active node (`deleted_at IS NULL`) with the same `owner_id = p_user_id` and `url = p_url`. If found:
   * `already_exists` = true.
   * Return the existing `node_id`.
   * Do **not** create a new cause, node, or edge.
   * Do **not** re-apply folder/tag/description in MVP (the popup will show the "Already saved" state).
3. **External source resolution** — resolve `external_sources.id` from `p_external_source_name`; default to `'chrome_extension'`.
4. **Node creation** — call `create_node_with_metadata` with:
   * `p_owner_id := p_user_id`
   * `p_url := p_url`
   * `p_text_content := NULL`
   * `p_title := p_title` (fallback to `p_url` if NULL)
   * `p_thumbnail_key := p_thumbnail_key`
   * `p_language_code := p_language_code`
   * `p_tag_labels := COALESCE(p_new_tag_labels, '{}')`
   * `p_cause_metadata := jsonb_build_object('url', p_url, 'source', p_external_source_name)`
5. **Folder assignment** — if `p_folder_id` is not NULL and `has_folder_permission(p_user_id, p_folder_id, 'contribute')` is true, call `add_node_to_folder(v_node_id, p_folder_id)`.
6. **Existing-tag assignment** — for each `tag_id` in `p_tag_ids` that exists in `tags`, insert into `tag_edges` (`ON CONFLICT DO NOTHING`).
7. **Description / translation** — insert or update one `translations` row for `(v_node_id, p_language_code)` with `title = p_title` and `description = p_description` (skip if `p_description` is NULL or whitespace-only).
8. **External provenance** — insert `external_items_map` row:
   * `external_source_id` from step 3.
   * `external_id := COALESCE(p_external_id, p_user_id || ':' || p_url)`.
   * `node_id := v_node_id`.
   * `ON CONFLICT DO NOTHING`.
9. Return `node_id` and `already_exists = false`.

**Acceptance:**
- [ ] A fresh URL import returns a new `node_id` and `already_exists = false`.
- [ ] A duplicate URL import for the same user returns the existing `node_id` and `already_exists = true`.
- [ ] After a successful import, the DB contains exactly one `causes` row (`cause_type = 'import'`), one `edges` row (`direction = 'sent'`, `depth = 0`), optional `folder_edges`, optional `tag_edges`, and one `external_items_map` row.
- [ ] The function is granted to `authenticated` and `service_role`.

---

## Phase 1 — Backend API Routes

### EXT-1.1 — Create token-aware Supabase helper

**Goal:** The API routes need to resolve a user from the `Authorization: Bearer <access_token>` header sent by the extension.

**Files to touch:**
* `lib/supabase/server.ts` (or new `lib/supabase/token.ts`)

**Change:**
Add a small helper:

```ts
export async function getSupabaseServerClientFromToken(accessToken: string) {
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
      auth: { autoRefreshToken: false, detectSessionInUrl: false }
    }
  );
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) throw new Error('Invalid token');
  return { supabase, user: data.user };
}
```

**Acceptance:**
- [ ] Calling the helper with a valid access token returns the LIKED user.
- [ ] Calling it with an invalid/expired token throws.

---

### EXT-1.2 — Implement `POST /api/import`

**Goal:** The extension's sole mutation endpoint. It is an orchestrator: validate, extract metadata, call `import_url`.

**Files to touch:**
* `app/api/import/route.ts`
* `lib/db/import.ts` (optional thin wrapper around `import_url` RPC)

**Request contract:**
```ts
interface ImportRequest {
  url: string;
  folderId?: string;
  tagIds?: string[];
  newTagLabels?: string[];      // only if UI supports creating tags
  description?: string;
  clientMetadata?: {
    pageTitle?: string;
    pageDescription?: string;
    faviconUrl?: string;
  };
}
```

**Response contract:**
```ts
interface ImportResponse {
  success: true;
  nodeId: string;
  alreadyExists: boolean;
}

interface ImportError {
  success: false;
  code: 'unauthenticated' | 'invalid' | 'network' | 'server';
  message: string;
}
```

**Behavior:**
1. Set CORS headers (`Access-Control-Allow-Origin: *` for MVP; credentials are not used because auth is header-based).
2. Extract `Authorization: Bearer <token>`; 401 if missing/invalid.
3. Read and validate body (`url` required, valid HTTP/HTTPS URL).
4. Fetch the user's `language_code` from `users`.
5. Invoke the `extract-node-metadata` Edge Function with:
   * `url`
   * `user_language_code`
   * `client_title`, `client_description`, `favicon_url` as optional fallbacks.
   * 10-second timeout; on failure, continue with `clientMetadata` fallbacks.
6. Determine final values:
   * `title` = Edge Function `title` → `clientMetadata.pageTitle` → `url`.
   * `thumbnailKey` = Edge Function `thumbnail_key` → null.
   * `languageCode` = Edge Function `language_code` → user `language_code` → `'en'`.
   * `description` = user `description` (the user's note) → Edge Function `description` → null.
7. Call `import_url` RPC with all fields.
8. Return `{ success: true, nodeId, alreadyExists }`.

**Errors:**
* 401 `unauthenticated`
* 400 `invalid` (bad URL or missing required field)
* 503 `network` (backend unreachable / Edge Function unreachable)
* 500 `server` (RPC failure)

**Acceptance:**
- [ ] `curl` with a valid token and URL returns `success: true` and a `nodeId`.
- [ ] The created node appears in the user's feed via `get_feed()`.
- [ ] Folder and tags are reflected on the node.
- [ ] Duplicate import returns `alreadyExists: true`.

---

### EXT-1.3 — Implement `GET /api/extension/folders`

**Goal:** Provide the popup folder picker with the user's folder hierarchy.

**Files to touch:**
* `app/api/extension/folders/route.ts`
* `lib/db/folders.ts` (add `getUserFoldersByUserId` if needed)

**Change:**
* Authenticate via token helper.
* Call `getUserFolders()` or a new `getUserFoldersByUserId(userId)` wrapper.
* Return a flat array with `id`, `name`, `parent_folder_id`, `color_hex`.

**Acceptance:**
- [ ] Returns only folders the authenticated user owns or has access to.
- [ ] Includes `parent_folder_id` so the popup can render a tree.
- [ ] CORS headers present.

---

### EXT-1.4 — Implement `GET /api/extension/tags`

**Goal:** Provide the popup tag picker with canonical LIKED tags.

**Files to touch:**
* `app/api/extension/tags/route.ts`
* `lib/db/tags.ts` (`getVisibleTags` or `getAllTags`)

**Change:**
* Authenticate via token helper.
* Use `getVisibleTags(userId, languageCode)` (or `getAllTags`) to fetch tags.
* Return `{ id, label, color_hex }[]`.

**Acceptance:**
- [ ] Returns tags in the user's language with the deterministic fallback chain.
- [ ] CORS headers present.

---

## Phase 2 — Extension Authentication

### EXT-2.1 — Add extension manifest and permissions

**Goal:** Minimum viable Manifest V3 with only the permissions required by the PRD.

**Files to touch:**
* `extension/manifest.json`

**Minimal manifest:**
```json
{
  "manifest_version": 3,
  "name": "LIKED",
  "version": "0.1.0",
  "description": "Save the current page to LIKED.",
  "permissions": ["activeTab", "storage"],
  "action": {
    "default_popup": "dist/popup.html",
    "default_icon": {
      "16": "public/icons/icon16.png",
      "32": "public/icons/icon32.png"
    }
  },
  "icons": {
    "16": "public/icons/icon16.png",
    "32": "public/icons/icon32.png",
    "48": "public/icons/icon48.png",
    "128": "public/icons/icon128.png"
  },
  "background": {
    "service_worker": "dist/service-worker.js"
  },
  "externally_connectable": {
    "matches": ["https://<LIKED_HOST>/*"]
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'"
  }
}
```

Replace `<LIKED_HOST>` with the deployed domain (`liked.app` or `localhost:3000` for dev).

**Acceptance:**
- [ ] Chrome loads the unpacked extension without warnings.
- [ ] Only `activeTab` and `storage` are requested.
- [ ] No `history`, `tabs`, `webRequest`, or `cookies` permissions are declared.

---

### EXT-2.2 — Build the web-app auth relay page

**Goal:** After the user signs in on the LIKED website, send the Supabase session back to the extension and close the tab.

**Files to touch:**
* `app/extension/auth/page.tsx` (or `app/(app)/extension/auth/page.tsx` if protected by middleware)
* `.env.local` (add `NEXT_PUBLIC_EXTENSION_ID`)

**Behavior:**
1. Use `getSupabaseServerClient()` to get the current user and session.
2. If unauthenticated, render a "Sign in to LIKED" link/button pointing to `/login?redirect=/extension/auth`.
3. If authenticated, render a tiny script that calls:
   ```js
   chrome.runtime.sendMessage(
     process.env.NEXT_PUBLIC_EXTENSION_ID,
     { type: 'LIKED_SESSION', accessToken, refreshToken, expiresIn }
   );
   setTimeout(() => window.close(), 250);
   ```
4. The page must be served over HTTPS.

**Acceptance:**
- [ ] Visiting `/extension/auth` while signed in sends the session to the extension.
- [ ] The tab closes automatically.
- [ ] The `NEXT_PUBLIC_EXTENSION_ID` is configurable per environment.

---

### EXT-2.3 — Implement extension auth/session module

**Goal:** Store and refresh the Supabase session inside the extension.

**Files to touch:**
* `extension/src/auth/session.ts`
* `extension/src/background/service-worker.ts`

**Change:**
* Use `chrome.storage.local` as a custom storage backend for `@supabase/supabase-js`.
* Create a lightweight `getSupabaseExtensionClient()` that uses the anon key and `chrome.storage.local`.
* In the service worker, listen for external messages:
  ```ts
  chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
    if (request.type === 'LIKED_SESSION') {
      // store accessToken, refreshToken, expiresIn
      chrome.storage.local.set({ session: request });
    }
  });
  ```
* Expose helpers: `getSession()`, `isAuthenticated()`, `signOut()`.
* `signIn()` opens `https://<LIKED_HOST>/extension/auth` in a new tab.

**Acceptance:**
- [ ] Signing in via the web app stores tokens in `chrome.storage.local`.
- [ ] The popup can read the session without re-authenticating on every open.
- [ ] `signOut` clears storage.

---

## Phase 3 — Extension Popup UI

### EXT-3.1 — Implement the popup UI

**Goal:** Match the PRD wireframe: title preview, folder picker, description, tag picker, save button.

**Files to touch:**
* `extension/src/popup/popup.html`
* `extension/src/popup/popup.ts`
* `extension/src/popup/popup.css`

**Behavior:**
1. On open:
   * If not authenticated, render the sign-in CTA and a **Sign in** button.
   * If authenticated, query `chrome.tabs.query({ active: true, currentWindow: true })` and read `tab.url`, `tab.title`, `tab.favIconUrl`.
   * Validate `url` (HTTP/HTTPS only). If invalid, show "This page cannot be saved."
   * Populate the title field with `tab.title` (displayed as a preview, not canonical).
   * Fetch `/api/extension/folders` and `/api/extension/tags`.
2. Folder picker: flat list rendered as a tree using `parent_folder_id`. Default = no folder.
3. Tag picker: multi-select chips from `/api/extension/tags`. For MVP, existing tags only. New-tag creation can be deferred or implemented by sending labels to `newTagLabels`.
4. Description: multiline textarea, optional, plain text only. Trim whitespace; treat whitespace-only as empty.
5. **Save to LIKED** button:
   * POST `/api/import` with the payload.
   * Show loading state.
   * On success with `alreadyExists: false`: show ✓ Saved, then auto-close after ~1.5s.
   * On success with `alreadyExists: true`: show "Already saved" with an **Open in LIKED** button linking to `https://<LIKED_HOST>/feed?node=<nodeId>`.
   * On error: show the mapped error UI (Sign in / Try again / Cannot be saved / Server error).

**Acceptance:**
- [ ] Popup opens instantly and shows the active tab title and URL.
- [ ] Folder and tag data load and render correctly.
- [ ] Save succeeds and the popup closes.
- [ ] Duplicate URLs show the "Already saved" state.
- [ ] Errors show the messages defined in PRD §22.

---

### EXT-3.2 — Implement `liked-client.ts`

**Goal:** All extension API calls in one typed client.

**Files to touch:**
* `extension/src/api/liked-client.ts`

**Change:**
```ts
export class LikedClient {
  constructor(baseUrl: string, getToken: () => Promise<string | null>) {}
  async importPage(payload: ImportRequest): Promise<ImportResult> {}
  async getFolders(): Promise<Folder[]> {}
  async getTags(): Promise<Tag[]> {}
}
```

**Requirements:**
* Every request uses `Authorization: Bearer <token>`.
* Use `fetch` with HTTPS only.
* Validate response JSON and surface typed errors.
* 401 triggers an unauthenticated error state in the popup.

**Acceptance:**
- [ ] All API calls share the same base URL and token logic.
- [ ] Errors are normalized to `{ code, message }`.

---

### EXT-3.3 — Implement the service worker

**Goal:** Handle external auth messages and keep the popup lightweight.

**Files to touch:**
* `extension/src/background/service-worker.ts`

**Change:**
* Listen for `chrome.runtime.onMessageExternal` (auth relay).
* Listen for `chrome.runtime.onInstalled` to set default icon state.
* No browsing history monitoring, no background sync, no feed polling.

**Acceptance:**
- [ ] The service worker stores the session from the web app.
- [ ] It does not request or use `tabs`, `webRequest`, or `history`.

---

## Phase 4 — Build, Assets, and Configuration

### EXT-4.1 — Add extension build tooling

**Goal:** Compile TypeScript and bundle popup/service worker into `extension/dist/`.

**Files to touch:**
* `extension/package.json`
* `extension/tsconfig.json`
* Root `package.json` (add `build:extension` and `dev:extension`)

**Recommended tools:** `esbuild` for bundling, `@types/chrome` for types.

**Build outputs:**
* `extension/dist/popup.js`
* `extension/dist/service-worker.js`
* `extension/dist/popup.html`
* `extension/dist/popup.css`

**Acceptance:**
- [ ] `npm run build:extension` completes with no errors.
- [ ] The generated `dist/` folder can be loaded as an unpacked extension in Chrome.

---

### EXT-4.2 — Add extension icons and assets

**Goal:** Provide the icon set required by Manifest V3.

**Files to touch:**
* `extension/public/icons/icon16.png`
* `extension/public/icons/icon32.png`
* `extension/public/icons/icon48.png`
* `extension/public/icons/icon128.png`

**Acceptance:**
- [ ] All four icon sizes are present and referenced by `manifest.json`.

---

### EXT-4.3 — Document environment variables

**Goal:** Make the extension configurable per environment.

**Files to touch:**
* `.env.local` / `.env.example`
* `extension/README.md`

**Variables:**
```
NEXT_PUBLIC_LIKED_API_URL=https://<LIKED_HOST>
NEXT_PUBLIC_SUPABASE_URL=<...>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<...>
NEXT_PUBLIC_EXTENSION_ID=<chrome-extension-id>
```

The extension build should inline `NEXT_PUBLIC_LIKED_API_URL` and `NEXT_PUBLIC_SUPABASE_*` values at build time.

**Acceptance:**
- [ ] A new developer can build and load the extension by following `extension/README.md`.

---

## Phase 5 — Integration, Validation & Security

### EXT-5.1 — CORS and environment wiring

**Goal:** Allow the extension to call the Next.js API routes from its `chrome-extension://` origin.

**Files to touch:**
* All `app/api/extension/*` routes and `app/api/import/route.ts`

**Change:**
* Add CORS headers to every extension route:
  ```ts
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info'
  };
  ```
* Handle `OPTIONS` preflight.

**Acceptance:**
- [ ] The extension popup can call `/api/import`, `/api/extension/folders`, and `/api/extension/tags` without CORS errors.
- [ ] Credentials are not sent as cookies; only the `Authorization` header is used.

---

### EXT-5.2 — Security review checklist

**Goal:** Ensure the extension follows PRD §24 and Chrome security requirements.

**Checklist:**
- [ ] Manifest permissions are limited to `activeTab` and `storage`.
- [ ] No Supabase service-role key, database credentials, or `NEXT_PUBLIC_` keys that are not safe for extension bundles.
- [ ] All API calls use HTTPS.
- [ ] URLs are validated before submission.
- [ ] The popup uses a strict CSP and avoids inline scripts.
- [ ] No browsing history is collected, stored, or transmitted.
- [ ] The extension only accesses the active tab when the user opens the popup.

**Acceptance:**
- [ ] Manifest passes Chrome Web Store automated policy checks (no broad host permissions, no `tabs`/`history`/`webRequest`).

---

### EXT-5.3 — End-to-end validation

**Goal:** Prove the full flow works against a real LIKED environment.

**Manual test script:**
1. Build the extension and load it unpacked in Chrome.
2. Open the LIKED web app, sign in, then open `/extension/auth`.
3. Confirm the extension popup no longer shows the sign-in CTA.
4. Visit `https://example.com` and click the LIKED extension icon.
5. Select a folder, add a description, pick one or two tags, and click **Save to LIKED**.
6. Open `https://<LIKED_HOST>/feed` and verify the node appears with:
   * Correct title (from metadata extraction).
   * Folder membership.
   * Tag chips.
   * Description in the card detail.
7. Click the extension icon on the same page again and confirm "Already saved".
8. Sign out and confirm the popup returns to the sign-in CTA.

**Acceptance:**
- [ ] All steps pass without errors.
- [ ] The feed still uses `get_feed()` exclusively; the extension did not manipulate feed state.

---

## Phase Gates

| Gate | Condition | Verification |
|------|-----------|--------------|
| **G0** | `import_url` RPC exists, is atomic, and returns `already_exists` | Run RPC in Supabase SQL Editor with duplicate and non-duplicate URLs |
| **G1** | `/api/import`, `/api/extension/folders`, `/api/extension/tags` return correct data | `curl` each endpoint with a valid access token |
| **G2** | Extension loads, signs in, and reads active tab | Manual Chrome extension load test |
| **G3** | Full save flow end-to-end | Save a page from extension and see it in `/feed` |
| **G4** | Security review passes | Manifest audit + no DB secrets in extension bundle |

---

## Future Enhancements (out of scope for MVP)

* Context menu "Save to LIKED" (PRD §39 — OPTIONAL).
* Keyboard shortcut `Ctrl/Cmd + Shift + L` (PRD §40 — OPTIONAL).
* New tag creation in the popup (PRD §16 — optional, requires `newTagLabels` support).
* Offline queue (PRD §23 — explicitly deferred).
* "Save all tabs" (PRD §38 — explicitly out of scope).

---

## Notes for the Executor

* Do **not** implement a feed, sharing, groups, or search in the extension.
* Do **not** let the extension create `causes`, `edges`, `folder_edges`, or `tag_edges` directly.
* All folder/tag data comes from the existing LIKED DB via the new `/api/extension/*` routes.
* The canonical metadata extraction pipeline (`extract-node-metadata` Edge Function) remains the source of truth for node title, description, thumbnail, language, and suggested tags.
* When in doubt, the extension only submits user intent: *"Import this URL with these optional attributes."*

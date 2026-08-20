# LIKED — Chrome Extension Product Requirements Document

**Version:** 2.0  
**Status:** AUTHORITATIVE / DRAFT-FOR-REVIEW  
**Product:** LIKED  
**Platform:** Google Chrome / Chromium-based browsers  
**Parent system:** LIKED Web Application  
**Companion to:** `docs/01_PRD.md`, `docs/03_TECHNICAL_ARCHITECTURE.md`, `docs/04_FEED_SQL_SPEC.md`, `docs/05_CHROME_EXTENSION_ATOMIC_PLAN.md`

---

## Authority & Scope

This document defines the product direction for the LIKED browser capture surface. It is subordinate to `docs/01_PRD.md` and `docs/03_TECHNICAL_ARCHITECTURE.md`; all architectural invariants defined there remain binding.

Non-negotiable invariants:

* **Visibility = `edges` only.** The extension never computes, stores, or hints at visibility.
* **Feed = `get_feed()` only.** The extension implements no feed, sort, filter, dedup, or pagination logic.
* **Writes = one atomic transaction.** Every save creates `cause` → `node` → `edge`, with optional `folder_edges`, `tag_edges`, and `node_notes`. No partial writes.
* **Nodes = content source of truth.** The extension sends only `url` + optional user metadata; canonical metadata extraction stays on the backend.
* **No database credentials in the extension.** All persistence goes through authenticated HTTPS API calls.
* **No feed, search, or sharing in the extension.** The extension is a thin import client.

---

## Change Log

Sections added or modified relative to any earlier Chrome Extension direction:

| Section | Change |
|---|---|
| 1. Product Direction | added |
| 2. Core Value Proposition | added |
| 3. Product Philosophy | added |
| 4. Extension Core Workflow | expanded with YouTube focus |
| 5. Save UX | expanded; “capture first, organize later” |
| 6. Collections | added |
| 7. Tags | expanded |
| 8. Personal Notes | new |
| 9. Search & Rediscovery | new |
| 10. Creator Workflow | new |
| 11. AI-Assisted Organization | new (P2) |
| 12. Library UI | new |
| 13. Extension ↔ Web App Relationship | new |
| 14. MVP Priority | new P0/P1/P2 framing |
| 15. Duplicate Handling | tightened around YouTube video ID |
| 16. Generic Web Content | added |
| 17. Data Model & Sources of Truth | retained and aligned |
| 18. API Contract | retained with additions |
| 19. Authentication & Security | retained |
| 20. Error States | retained |
| 21. Offline Behavior | retained |
| 22. Non-Goals | retained |
| 23. Open Questions | new |

---

## 1. Product Direction

LIKED is positioned as:

> **The personal organization layer for YouTube and web content.**

The Chrome extension is the primary capture mechanism.

The core user problem:

> **“I found something worth keeping, but I don't want to lose it.”**

LIKED lets the user capture that content instantly, organize it with minimal effort, add personal context, and find it again later.

The central product loop is:

```
CAPTURE → ORGANIZE → UNDERSTAND → REDISCOVER
```

* **CAPTURE** — one-click save from the browser.
* **ORGANIZE** — collections, tags, and notes applied at capture time or later.
* **UNDERSTAND** — AI enrichment (P2+): topics, summaries, related content.
* **REDISCOVER** — fast, keyword/semantic search across the personal library.

The extension owns CAPTURE and quick ORGANIZATION. The web app owns deep ORGANIZATION, UNDERSTAND, and REDISCOVER.

---

## 2. Core Value Proposition

LIKED is **NOT** primarily:

* a YouTube analytics tool
* a YouTube replacement
* a video editor
* a social network
* a full project-management system
* a Notion competitor

Instead:

> **LIKED remembers the content users find valuable and makes it easy to organize and retrieve later.**

The Chrome extension makes saving content essentially frictionless.

Target users include:

* YouTube viewers
* researchers
* developers
* students
* creators
* entrepreneurs
* professionals
* anyone who regularly discovers useful online content

Creators are an important target segment because they constantly collect:

* research
* competitor videos
* inspiration
* tutorials
* references
* content ideas
* production techniques
* tools
* educational material

---

## 3. Product Philosophy

1. **Capture first.** Saving must be instantaneous.
2. **Organization should be optional.** Users should not have to classify everything immediately.
3. **Everything should be recoverable.** The user should be able to find saved content later even if they forgot the title.
4. **Personal context matters.** Notes and tags turn a bookmark into useful personal knowledge.
5. **AI reduces organizational friction.** AI should classify and enrich content automatically where useful.
6. **Stay focused.** LIKED is a personal content library, not another social network or productivity suite.

---

## 4. Extension Core Workflow

A user is watching a YouTube video.

They click **Save to LIKED**.

LIKED captures the relevant metadata automatically:

| Field | Required | Source |
|---|---|---|
| `url` | yes | active tab |
| `video_id` | yes for YouTube | parsed from URL / page |
| `title` | yes | page metadata / Open Graph |
| `thumbnail` | yes | page metadata / Open Graph |
| `channel_name` | yes if available | page metadata / oEmbed |
| `channel_id` | no | page metadata if available |
| `description` | no | page metadata if available |
| `date/time saved` | yes | server timestamp |

The user should not have to manually enter this information.

The popup then shows a confirmation. Folder, tags, and note can be added immediately or later in the web app.

---

## 5. Save UX

The save interaction must require minimal friction.

### Preferred flow

```
Click extension / Save button
        ↓
Small LIKED popup
        ↓
“Saved ✓”
        ↓
[ optionally: choose collection / add tags / add note ]
```

Optional metadata must **NOT** block the initial save.

The principle is:

> **Capture first. Organize later if desired.**

### Expanded save interface

```
SAVE TO LIKED

Video title
[How I Built a Multiplayer Game in Unity]

Collection
[Game Development ▼]

Tags
[Unity] [Multiplayer] [+ Add]

Note
[Why did you save this?]

            [ SAVE ]
```

The simplest possible interaction remains a single click.

---

## 6. Collections

Collections (folders) are a first-class organizational mechanism.

Example collections:

* Game Development
* Unity
* AI
* Business
* Music
* Research
* Inspiration
* Competitors
* Tutorials

A saved item may belong to multiple collections because the underlying `folder_edges` table supports many-to-many membership. Do not unnecessarily impose a single-folder hierarchy.

Collection identity is `folders.id`. Labels are the folder `name`.

---

## 7. Tags

Lightweight tagging helps users classify content.

Example tags:

* tutorial
* reference
* idea
* competitor
* important
* watch
* research
* inspiration

Users should be able to:

* add tags
* remove tags
* search tags
* filter by tags

Avoid creating a complicated tagging system in MVP. Tag identity is `tags.id`; displayed labels come from `tag_translations`.

---

## 8. Personal Notes

Each saved item supports a personal note.

Example:

> “Good explanation of client/server authority. Check the section around 8:30.”

Notes must be searchable. This is important because the user often remembers why they saved something, not the exact title.

Potential future support (P2+):

* timestamp
* highlight
* action item
* rating

Do not necessarily implement all of these in the MVP. The implementation plan must clearly distinguish MVP from future scope.

---

## 9. Search & Rediscovery

Search is treated as a core feature, not an afterthought.

Users should be able to search their LIKED library using:

* video title
* channel / source
* collection
* tags
* personal notes
* description (page metadata)

Example query:

```
unity multiplayer lag
```

This should find saved content related to those concepts even if the exact words are not in the title.

### MVP

Exact / keyword search using the existing `get_feed()` and `search_nodes` SQL pipeline.

### Future

Semantic / AI search across:

* title
* description
* transcript
* notes
* tags
* AI-generated summary

The implementation plan must distinguish MVP from future scope.

---

## 10. Creator Workflow

A YouTube creator may use LIKED as a research library.

```
RESEARCH
   ↓
Save competitor videos
   ↓
Organize by topic
   ↓
Add notes
   ↓
Find references later
   ↓
Use them while developing new content
```

Example collection tree:

```
YouTube Research
├── Competitors
├── Video Ideas
├── Hooks
├── Thumbnails
├── Editing Techniques
├── Tutorials
├── AI Tools
└── Inspiration
```

Do **not** turn this into a full creator project-management system. The purpose is content research and reference management.

---

## 11. AI-Assisted Organization (P2)

When a video is saved, LIKED should eventually be able to automatically suggest:

* **Topic** — e.g., “Unity Multiplayer Networking”
* **Tags** — e.g., Unity, Multiplayer, Networking, Game Development, Tutorial
* **Summary** — a short summary of the video's content
* **Suggested collection** — e.g., “Game Development”

The user should be able to accept, modify, or reject AI suggestions.

**Important:** AI should reduce organizational effort, not create additional work.

The implementation plan must identify what is realistic for MVP versus later phases.

---

## 12. Future “Why Did I Save This?” Capability (P2+)

Document this as a future product opportunity.

LIKED should eventually understand the user's saved library well enough to answer questions such as:

* “Show me the videos I saved about Unity multiplayer.”
* “What videos did I save about server authority?”
* “I remember a video about reducing network latency. Find it.”
* “Show me videos related to this project.”

This reinforces the product's long-term value as a personal knowledge layer over saved web content.

---

## 13. Library UI (Web App)

The web application/library should eventually allow:

* Grid view
* List view
* Search
* Collections
* Tags
* Filters
* Sort by date saved
* Sort by title
* Sort by channel / source
* Recently saved
* Recently accessed

Each saved item should clearly expose:

* thumbnail
* title
* channel / source
* collection(s)
* tags
* saved date
* personal note indicator

Do not overload the UI. The product should feel like a clean personal library, not an enterprise database.

---

## 14. Extension ↔ LIKED Web App Relationship

```
             INTERNET
                 │
                 ▼
       ┌─────────────────┐
       │ Chrome Extension│
       │                 │
       │ Capture         │
       │ Quick Save      │
       │ Quick Tag       │
       │ Quick Collection│
       │ Quick Note      │
       └────────┬────────┘
                │
                ▼
          LIKED Backend
                │
                ▼
       ┌─────────────────┐
       │   LIKED Library │
       │                 │
       │ Search          │
       │ Collections     │
       │ Tags            │
       │ Notes           │
       │ AI              │
       └─────────────────┘
```

The extension is primarily:

> **CAPTURE + QUICK ORGANIZATION**

The web application is primarily:

> **LIBRARY + SEARCH + MANAGEMENT**

The extension should remain lightweight. Do not duplicate the entire LIKED web application inside the extension.

---

## 15. MVP Priority

### P0 — Essential

* Save YouTube video
* Automatic metadata capture (URL, video ID, title, thumbnail, channel, date saved)
* Authentication
* Save confirmation
* Collections
* Tags
* Personal notes
* Search
* Saved library
* Open original YouTube video

### P1 — Important

* Save from arbitrary web pages
* Better filtering
* Multiple collections per item
* Recently saved
* Improved extension UX
* Bulk organization
* Duplicate detection UX

### P2 — AI / Advanced

* Automatic tagging
* Automatic collection suggestion
* AI summaries
* Transcript indexing
* Semantic search
* Related-content discovery
* Natural-language queries

P0 must not depend on P2 architecture.

---

## 16. Duplicate Handling

If the user saves the same YouTube video twice, the system should **NOT** silently create duplicate library entries.

Instead:

> **Already saved**

and optionally allow the user to:

* change collection
* add another tag
* update the note

Define the unique identity primarily around the **YouTube video ID** for YouTube content. The data model must remain extensible for non-YouTube URLs later.

The extension does not independently decide that a page is a duplicate. It sends the URL to the backend import authority and surfaces the backend response.

---

## 17. Generic Web Content

Although YouTube is the initial focus, design the data model so LIKED can eventually save:

* websites
* articles
* blog posts
* documentation
* online tools
* potentially other media

Do **NOT** let this delay the YouTube MVP.

The architecture should be:

```
SavedItem
├── YouTube
├── Web Page
└── Future content types
```

rather than hard-coding the entire product around YouTube.

---

## 18. Data Model & Sources of Truth

| Domain | Source of truth |
|---|---|
| URL content | `nodes` |
| Import provenance | `causes` + `external_sources` / `external_items_map` |
| Visibility | `edges` |
| Folder membership | `folder_edges` |
| Tags | `tag_edges` + `tags` |
| Tag labels | `tag_translations` |
| Node title/description i18n | `translations` |
| Personal notes | `node_notes` (new table) |
| Feed | `get_feed()` |
| Authentication | LIKED authentication system |
| Folder hierarchy | `folders` / `folder_tree` |
| User identity | `users` |
| Source-specific metadata | `nodes.source_meta` |

The extension only submits:

* `url`
* `folder_id` (optional)
* `tag_ids` (optional)
* `new_tag_labels` (optional, only if the UI supports creating tags)
* `note` (optional)
* `client_metadata` (page title, page description, favicon URL — used as fallbacks)

The extension **MUST NOT** submit:

* `owner_id`
* `cause_id`
* `edge_id`
* `node_id`
* visibility state
* `sender_id`
* `depth`

Those values belong to the LIKED backend.

---

## 19. Authentication & Security

The extension requires an authenticated LIKED account.

### First use

If the user is not authenticated:

```
┌─────────────────────────────┐
│ Save to LIKED               │
│                             │
│ Sign in to save pages.      │
│                             │
│       [ SIGN IN ]           │
│                             │
└─────────────────────────────┘
```

Clicking **Sign In** opens the LIKED authentication flow in a browser tab. The extension must not collect or store the user's LIKED password.

### Session

The extension uses an authenticated LIKED session/token mechanism approved by the LIKED backend.

The extension **MUST NOT**:

* store the Supabase service-role key
* contain database credentials
* directly access protected database tables
* bypass the LIKED API
* create `causes`, `edges`, `folder_edges`, `tag_edges`, or `node_notes` directly

### Permissions

Target Manifest V3 permissions are minimal:

* `activeTab` — to read the active page URL/title/favicon when the user opens the popup
* `storage` — to cache the authenticated session locally

The extension should not require `history`, `tabs`, `webRequest`, or `cookies` unless the authentication architecture proves one of them necessary.

### Security requirements

* Use HTTPS for all LIKED communication.
* Validate API responses.
* Validate URLs before submission.
* Use authenticated requests.
* Avoid arbitrary script injection.
* Avoid collecting browsing history.

---

## 20. API Contract

### `POST /api/import`

**Request:**

```ts
interface ImportRequest {
  url: string;
  folderId?: string;
  tagIds?: string[];
  newTagLabels?: string[];   // only if the popup supports creating tags
  note?: string;             // user personal note
  clientMetadata?: {
    pageTitle?: string;
    pageDescription?: string;
    faviconUrl?: string;
  };
}
```

**Response:**

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

### `GET /api/extension/folders`

Returns the authenticated user's folder hierarchy:

```ts
{ id: string; name: string; parentFolderId: string | null; colorHex: string; isProject: boolean }[]
```

### `GET /api/extension/tags`

Returns the authenticated user's canonical tags in the user's language:

```ts
{ id: string; label: string; colorHex: string }[]
```

---

## 21. Error States

| Condition | Message | Action |
|---|---|---|
| Authentication error | “Please sign in to LIKED.” | [ SIGN IN ] |
| Network error | “Unable to reach LIKED.” | [ TRY AGAIN ] |
| Validation error | “This page cannot be saved.” | — |
| Server error | “LIKED could not save this page. Please try again.” | [ TRY AGAIN ] |
| Duplicate | “Already saved” | [ OPEN IN LIKED ], optionally update collection/tags/note |

The extension must never claim success before receiving a confirmed backend success.

---

## 22. Offline Behavior (MVP)

The extension does not create permanent local LIKED state while offline.

If the save request cannot reach LIKED, show:

> Save failed

The user may retry. A future offline queue may be introduced as a separate specification and must not be implemented implicitly.

---

## 23. Non-Goals

The Chrome extension does **NOT**:

* display the LIKED feed
* implement sharing
* implement groups
* implement friend management
* implement ratings
* implement search
* implement feed filtering
* implement feed sorting
* implement feed deduplication
* determine visibility
* directly manipulate `edges`
* directly manipulate `causes`
* contain a local LIKED database
* replicate LIKED's metadata extraction engine
* replicate LIKED's folder logic
* replicate LIKED's tag logic
* implement AI organization in MVP

---

## 24. Open Questions

1. Should the extension popup allow creating a new collection directly, or only select existing collections in P0?
2. On duplicate save, should the backend automatically merge new collection/tag/note choices, or only offer an “Open in LIKED” action?
3. Should the personal note field start blank, or be pre-populated with the page description?
4. Should AI-suggested tags be fetched from the backend even in P0 (displayed as optional hints) or hidden until P2?
5. Which YouTube URL form is canonical (e.g., `https://www.youtube.com/watch?v=VIDEO_ID` vs `https://youtu.be/VIDEO_ID`) and should it be shown to the user?
6. Should `node_notes` support multiple notes per node per user, or exactly one note per node per user?

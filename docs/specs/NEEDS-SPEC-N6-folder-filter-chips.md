# NEEDS-SPEC N6 — Folder filter chips

**Status:** proposal — awaiting decision. No implementation has been done.

## The decision

Which slice of the spec'd folder-chip filter UX to build — the PRD describes
folder chips that (a) select a folder as the active feed filter on click, and
(b) display average rating + friend-access avatars with "View all".

## Current state (verified in code)

- `ContextStrip` (`components/bars/ContextStrip.tsx`) already renders
  `type:'folder'` pills as active-filter indicators — the "pill with ×"
  half of the feature exists.
- `DroppableFolderChip` exists as a drag-and-drop **target**, used by
  `Sidebar` and `FolderSection` — chips exist for dnd, not as a filter rail.
- No horizontally-scrollable folder-chip **filter rail** exists; folder-as-
  filter happens via sidebar tree / folder sections, not chips.
- PRD references: folder chip click = active filter (~line 1068); folder
  chips show avg rating + friend access avatars with "View all" (~line 1432).

## Hard constraints

- Feed filtering authority is SQL-only (`get_feed` / `buildFeedParams` —
  `folderId` param already exists). A chip rail is a UI entry point into an
  existing filter param — no new feed logic needed or permitted.
- "Friend access avatars" per folder requires per-folder access data — the
  spec'd source (`get_folder_access_users`, §5.4) **does not exist live**
  (N7). That metadata is blocked on the N7 decision.

## Options

### A — Full spec: chip rail w/ avg rating + friend avatars + View all
**Effort: M–L.** Tradeoff: delivers PRD-verbatim chip rail; but the avatar
half depends on N7's missing RPC (or a new direct query that re-opens the
service-client question), and avg-rating needs a per-folder aggregate read.

### B — Minimal: clickable folder chips as filter entry point only
Make existing folder chips/pills clickable → set `filterStore.folderId`; no
metadata on the chip. **Effort: S.** Tradeoff: delivers the *interaction* the
PRD describes (chip → filter) without new data dependencies; leaves the
metadata-rich chip for later. No new reads, no RPC blockers.

### C — Defer entirely
**Effort: S.** Tradeoff: sidebar tree + context pills already cover folder
filtering functionally; chips are a redundant entry point. Costs nothing,
leaves a spec gap.

## Recommendation

**Option B.** The click-to-filter half is cheap and unblocked; the metadata
half is genuinely gated on N7 (access-users RPC doesn't exist) — building A
now would either stall or force a service-client query that re-creates the
exact drift N7 is meant to resolve.

*This is a recommendation, not a decision.*

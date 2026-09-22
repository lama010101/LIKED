# NEEDS-SPEC N5 — Ranked-list folder variant

**Status:** proposal — awaiting decision. No implementation has been done.

## The decision

Build, defer, or cut the spec'd "Ranked List" folder-tile variant (a folder
tile whose face renders an internal scrollable ranked list instead of the
2×2 collage).

## Hard constraints already in spec (PRD ~§11 tile variants, lines ~920/2279)

- Spec'd anatomy: tile face renders an **internal scrollable ranked list** of
  the folder's top N items; each row = numeric rank + mini thumbnail + title +
  rating value; vertically scrollable within tile bounds.
- Driven by a **`rankedList: true` flag on the folder node** — implies a
  folder-level attribute that does not currently exist in schema
  (`folders` has no such column/flag; would need one, or metadata).
- §41 pivot keeps "general use" (folders as shareable boards) in scope, but
  the wedge is YouTube-activity — ranked lists are general-scope polish.

## Options

### A — Build per spec
Add the folder flag (migration), ranking source (average rating ordering —
needs a read path; feed-lock means ordering must come from SQL, not client
sort), and the ranked tile renderer in `FolderSection`/folder-tile.
**Effort: M.** Tradeoff: completes a spec'd variant; but adds a schema flag +
a new ordering read (RPC or spec'd query) for a feature with no current user
demand signal.

### B — Defer (keep spec'd, unscheduled)
**Effort: S.** Tradeoff: honest status — the variant stays on the books but
post-pivot; nothing built now. Zero code risk; keeps spec intact.

### C — Cut from spec
Remove the variant from PRD + checklists. **Effort: S** (docs-only).
Tradeoff: reduces spec surface and checklist debt; loses a designed
differentiator for "Top Rated"-style boards — a product call, not technical.

## Recommendation

**Option B.** The §41 pivot makes YouTube-core the wedge; a general-scope
tile variant is the wrong place to spend M effort this cycle. Cutting (C) is
also defensible if the CTO wants a leaner PRD — but deferral preserves the
option at zero cost.

*This is a recommendation, not a decision.*

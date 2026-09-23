# SPEC V13 — UI direction: Pinterest-board grid vs V2 shell (N11 input)

**Status:** spec proposal — feeds owner decision, incl. disposition of the
parked N11 prototype.

## Current state evidence

- V2 shell is live in production: `Sidebar`, `AppHeader`, `StoriesBar`,
  `FoldersStrip`, `FeedControlsBar`, `VideoCard` grid + ColView /
  MasonView / ListView / HorizView view switcher (UIX-PORT-01..14).
- `MasonView` already provides a masonry-style grid — the closest thing
  to a Pinterest board today.
- Prototype parked untracked: `app/prototype/` + ~30 reference images;
  N11 triage default = delete, awaiting owner.

## The decision

Whether the product direction is (a) Pinterest-style pin-grid boards as
a first-class surface, or (b) the current V2 social feed shell with
folders — and what happens to the parked prototype.

## Options

### A — Pinterest pin-grid as a 6th view mode (incremental)

- Add `BoardView` beside MasonView: bigger thumbs, folder-as-board cover
  tiles, minimal chrome. Reuses feed items (get_feed output unchanged —
  view layer only).
- Effort: S–M. Keeps V2 identity while offering the board aesthetic.

### B — Prototype ship (Pinterest-clone direction)

- Adopt `app/prototype/` as the product direction. Effort: L — full
  re-skin, new component set, re-run UIX-PORT. High churn; only if the
  owner wants the Pinterest identity wholesale.

### C — Status quo + delete prototype (recommended)

- V2 shell is coherent and shipped; MasonView already covers the
  grid/board need. Delete `app/prototype/` + reference images (N11
  default) — they are untracked, so deletion is a filesystem-only op
  recorded in this spec; keep a zip outside the repo if reference is
  wanted.

## Recommendation

**C** (with A as the cheap upgrade path if board-mode proves desirable).
N11 disposition: delete the parked prototype — it has no unique data.

## Open questions for owner

- Confirm prototype deletion (default per N11 triage).
- Whether view-mode switching stays user-local (current localStorage
  per context) or becomes a per-folder persisted preference.

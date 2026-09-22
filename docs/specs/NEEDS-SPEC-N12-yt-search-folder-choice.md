# NEEDS-SPEC N12 — YouTube-search save folder choice

**Status:** proposal — awaiting decision. No implementation has been done.

## The decision

Which folder(s) a card saved from in-app YouTube search (YT-SEARCH-001) should
land in.

## Verified current behavior (`components/sheets/AddCardSheet.tsx`,
`app/lib/actions/youtubeImport.ts`)

Two folder writes can fire on one save:

1. `importYouTubeActivity` → RPC `p_auto_folder_name="YouTube"` — **always**
   auto-folders the new node into a folder literally named "YouTube" (created
   if absent), inside the same transaction.
2. `applyPostSaveSelections(nodeId)` then **additionally** adds the node to
   `activeFolderId || selectedFolder` when one is set (separate
   `add_node_to_folder` call, post-RPC).

Net: a YT-search save can land in **both** "YouTube" and the user's
active/selected folder — dual membership that may or may not be intended.

## Options

### A — Status quo (auto-"YouTube" + optional extra folder)
**Effort: S** (nothing). Tradeoff: dual membership is surprising — user
saving into "Music" also silently files under "YouTube"; conversely it
guarantees YT saves are always findable in one place.

### B — Active/selected folder wins; "YouTube" only as fallback
If `activeFolderId || selectedFolder` is set, skip auto-folder (or pass the
chosen folder as `p_auto_folder_name`'s target). **Effort: S** — mostly
plumbing a param the RPC already accepts. Tradeoff: single predictable
location respecting explicit context; loses the always-in-YouTube invariant.

### C — Always auto-"YouTube"; drop the post-save folder add
**Effort: S** (delete the `addNodeToFolderAction` branch for YT saves).
Tradeoff: dead-simple, one location; ignores the folder the user was
literally standing in when they hit save — likely the strongest UX surprise
of the three.

## Recommendation

**Option B.** The user's active folder context is an explicit signal and
should win; "YouTube" remains the sensible default when no context exists.
Dual membership (A) optimizes findability at the cost of a silent second
filing — the kind of invisible state the rest of this system works to avoid.

*This is a recommendation, not a decision.*

---

## Triage (PHASE3-PURGE-MERGE-SPECTRIAGE-001)

**Tier 1 — proposed default: Option B (explicit folder context wins; "YouTube"
auto-folder as fallback only).** Two conventions collide and the resolution
is clear: `applyPostSaveSelections` is the sheet's *generic* post-save
mechanism honoring the user's explicit selections — that convention should
win over the import pipeline's blanket auto-archive (`p_auto_folder_name=
"YouTube"`), which exists for the bulk YouTube-import flow where no live
folder context exists. Dual membership isn't a schema violation (folders are
boards; multi-membership is legal) but it's a silent second filing — the
least-surprise behavior is: save lands where the user is standing, else in
"YouTube". Proposed default; will proceed unless told otherwise.

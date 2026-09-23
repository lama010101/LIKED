# SPEC V12 — Collaborative folders / mood-boards (multi-user add)

**Status:** spec proposal — no implementation.

## Current state evidence (live, post COMPLETE-APP-002)

- `add_node_to_folder` allows a write wherever `folder_is_accessible` is
  true — which includes **view-level** recipients (a `direct_share` cause
  with `metadata.folder_id`, or any edge on a contained node).
- `move_node_to_folder` is stricter (owner/folder_admin).
- `has_folder_permission` / `get_folder_permission` implement the rank
  model `view < comment < contribute < edit < reshare < admin`, but no
  write path consults them. All live edges are `permission='view'`.
- `get_user_folders` returns owner folders only → no UI surface lists
  folders *shared with* the user as collections.
- `folder_edges` is deliberately exempt from the cause/edge write system
  (N9 ruling, invariant DB-15) — membership rows carry no cause.

## The decision

What does "collaborative board" mean for LIKED: who may add, who may
remove, and what a shared folder's members see.

## Options

### A — Enforce the permission rank on write paths (recommended)

- `add_node_to_folder`/`remove_node_from_folder`/`move_node_to_folder`
  require `has_folder_permission(caller, folder, 'contribute')`.
- `share_folder` already takes `p_permission`; UI starts offering
  "Can contribute" for board-style shares.
- Data-model impact: none — permission lives on the share cause/edge
  already. The `folder_edges` exemption (N9) is untouched: membership
  rows still carry no cause; only the *gate* on writes tightens.
- Tier-0 note: visibility stays edges-only and read-side; permissions
  gate writes, not visibility — the invariant set is unaffected.

### B — Shared-folder read model (complements A)

- New read RPC listing folders shared *to* the caller (non-owner scope),
  since `get_user_folders` is owner-only. Sidebar gains a "Shared with
  me" section. Required for collaborative boards to be discoverable.

### C — Dedicated mood-board surface (largest)

- Separate board entity/canvas — not recommended for v1; folders +
  A+B deliver the same value without a parallel data model.

## Recommendation

Ship **A + B**: enforce `contribute` on the three membership write RPCs
and add a shared-with-me folder listing. Defer C. Migration risk: none —
no schema change for A; B is a new read RPC following the G-1/G-2
conventions (auth.uid() inside, SECURITY DEFINER, revoked anon/PUBLIC).

## Open questions for owner

- Should `view` recipients be able to *re-share* a board? (rank model
  already has `reshare`; decision needed before A ships.)
- Removal semantics: can a contributor remove others' items, or only
  their own + admins? (Recommend: own items + admins.)

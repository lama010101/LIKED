# NEEDS-SPEC N7 — Sidebar-query drift (spec §5.4–5.7 RPCs vs direct queries)

**Status:** proposal — awaiting decision. No implementation has been done.

## The decision

Resolve the drift between feed spec §5.4–5.7 (which specifies five RPCs, all
**verified absent live**) and the code, which uses direct service-client
queries / client-side derivation instead.

## Verified live state (PLAN-CLASSIFY live probe 2026-09-21 + AUDIT-06)

| Spec section | Spec'd RPC | Live reality |
|---|---|---|
| §5.4 folder access users | `get_folder_access_users` | **Feature unbuilt** — no RPC, no TS impl (DOC-FIX-001 flag) |
| §5.4 group access users | `get_group_access_users` | **Feature unbuilt** — same |
| §5.5 breadcrumb | `get_folder_breadcrumb` | Client-side `parent_folder_id` walk over `get_folder_tree` results — read-only, **no authz gap** |
| §5.6 notification count | `get_unread_notification_count` | Direct **service-client** query (`getUnreadNotificationCountAction`) |
| §5.7 trash count | `get_trash_count` | Direct **service-client** query (`getTrashedCount`/`getTrashCount`) |

Related remnants (AUDIT-06): **P1-11** `getFolderTree` reimplements
visibility/sharing in TypeScript **on the service client**; **P2-11**
`getUserFolders` aggregates counts/thumbnails in TS; **P2-2** `FeedGrid`
filters the folder list client-side.

## Correctness/security gap — stated plainly

This is **not** cosmetic drift:

- **Service client bypasses RLS entirely.** `getFolderTree` (P1-11) computes
  which folders a user can see via hand-rolled TS joins over `edges`/`causes`
  — a bug in that manual filter leaks folder visibility across users. This is
  the single largest gap: *authorization logic reimplemented outside the DB
  with a credential that ignores authorization.*
- Notification/trash counts (§5.6/§5.7) are `user_id`-scoped service-client
  reads — same RLS-bypass class, much smaller blast radius (a dropped `.eq`
  leaks counts, not content).
- Breadcrumb derivation (§5.5) runs over already-authorized RPC results —
  **no correctness or security gap**; it's a spec-wording difference only.
- The two §5.4 RPCs describe a feature that **doesn't exist at all** — N6
  option A is blocked on this.

## Options

### A — Implement the spec'd RPCs (+ `get_folder_tree`/`get_user_folders`)
Create the five RPCs per §5.4–5.7 and the two AUDIT-06 follow-up RPCs;
delete the TS visibility/count logic. **Effort: M–L.** Tradeoff: conforms to
spec, eliminates the P1-11 RLS-bypass at the root; cost is migrations +
review + the RPC authz gates (migration 092/094 pattern).

### B — Amend spec to bless direct reads, fix the client used
Update §5.4–5.7 wording to "direct query" AND switch the service-client reads
to the user-session client so RLS is the enforcement layer. **Effort: S–M.**
Tradeoff: smaller diff, keeps flexibility; but RLS policies on
folders/edges/causes may not expose what the queries need (policy work likely
anyway), and hand-rolled visibility logic still lives in TS — just under RLS.

### C — Status quo + document
**Effort: S.** Tradeoff: leaves P1-11's service-client visibility logic live —
the audit already rates this P1.

## Recommendation

**Option A for the visibility-touching queries** (`get_folder_tree` first —
it's the only place cross-user visibility is computed in TS with a
god-credential); **either A or B is acceptable for the pure counts**
(§5.6/§5.7) and the unbuilt §5.4 feature should be decided *as a feature*
("do we want folder-access highlighting?") before its RPCs are written.

*This is a recommendation, not a decision.*

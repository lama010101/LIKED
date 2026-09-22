# NEEDS-SPEC N9 — `folder_edges` writes without `causes`/`edges`

**Status:** proposal — awaiting decision. No implementation has been done.

## The decision

Whether folder-membership writes (`folder_edges` rows) must conform to the
project write-system rule — every write creates a `cause` plus `edges` linked
to it, in one transaction — or whether `folder_edges` is legitimately an
auxiliary table outside that rule.

## Verified current behavior (AUDIT-06 P2-14)

- `add_node_to_folder` (`supabase/migrations/036_folder_write_rpcs.sql`)
  inserts `folder_edges` with **no `causes`/`edges` row**.
- `remove_node_from_folder` does a **direct `DELETE FROM folder_edges`** —
  not a cascade delete (PRD: "deletion = cascade only").
- Meanwhile node-level writes do produce cause+edges (`import_url`,
  `create_node_with_metadata`), so two write shapes coexist today.

## What's actually at stake

- **Auditability:** no cause row → folder membership changes are invisible to
  any cause-based history/undo/audit feature.
- **Visibility semantics:** "visibility = edges only" — folder membership
  currently does **not** grant visibility via edges; whether it *should* is
  the product half of this decision (does adding a card to a shared folder
  share it with folder members?).
- **Delete semantics:** `remove_node_from_folder`'s direct DELETE either
  violates "cascade only" or `folder_edges` needs an explicit exemption.

## Options

### A — Bring folder membership into the cause→edges system
New `cause_type` (e.g. `folder_membership`), edges rows per membership write,
backfill existing `folder_edges`, rework both RPCs. **Effort: M–L.**
Tradeoff: full uniformity — every write is cause→edges, deletion is cascade,
audit trail exists; but adds edges rows for a relationship that isn't
node↔user visibility, which may conflate what edges *mean* (edge-driven
visibility queries could start seeing folder memberships).

### B — Keep `folder_edges` auxiliary; fix the two real defects
Amend the write-system rule with an explicit `folder_edges` exemption; make
`remove_node_from_folder`'s delete conform (e.g. treat membership removal as
non-cascade by design, or soft-delete column) and keep both RPCs
single-transaction. **Effort: S–M.** Tradeoff: small, honest scope; the
invariant scripts (R12 sweep) would need the exemption encoded or they'll
flag it forever.

### C — Status quo
**Effort: S.** Tradeoff: leaves the invariant ambiguous — every future audit
re-flags it; the direct DELETE remains a named PRD violation.

## Recommendation

**Option B**, unless the product answer to "does folder membership grant
visibility / need history" is *yes* — in which case A is the only honest
build. A purely for uniformity is the wrong reason; it would enlarge the
edges table with non-visibility rows and force every visibility query to
discriminate.

*This is a recommendation, not a decision.*

---

## Triage (PHASE3-PURGE-MERGE-SPECTRIAGE-001)

**Tier 1 — proposed default: Option B (explicit `folder_edges` exemption +
fix the delete semantics).** Evidence the exemption is the established
pattern: the Tier-0 invariant sweep (`check-invariants-001.mjs`, 14/14 PASS)
does not require cause/edge rows for `folder_edges` — folder membership has
been an auxiliary table since schema v1, and visibility remains edges-only
*of nodes*; membership ≠ node visibility. Folding membership into edges
(Option A) would pollute the visibility edge-set with non-visibility rows —
worse than the exemption. Two defects do get fixed under B:
`remove_node_from_folder`'s direct DELETE needs a ruling-adjacent fix
(membership removal is unlink, not entity-delete — document the exemption in
spec and encode it in the invariant checker so audits stop re-flagging), and
both RPCs must stay single-transaction. Proposed default; will proceed
unless told otherwise.

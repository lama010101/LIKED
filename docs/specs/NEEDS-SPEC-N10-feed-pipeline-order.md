# NEEDS-SPEC N10 — Feed pipeline-order ruling (AUDIT-02)

**Status:** proposal — awaiting decision. No implementation has been done.

## The decision

A CTO ruling on the one remaining AUDIT-02 CRITICAL: live `get_feed`'s stage
order deviates from spec — resolve by changing the SQL, or amending the spec.

## Verified facts (AUDIT-02-REPORT, still open)

- Spec `04_FEED_SQL_SPEC.md` §1 mandates:
  `nodes → visibility → context → block filter → cursor → ordering → dedup → limit`.
- Live migration `supabase/migrations/051_restore_get_feed.sql:322-380` has
  the `deduped` CTE **before** the `paginated` (cursor+order) CTE —
  i.e., `dedup → cursor+ordering → limit`.
- AUDIT-02 flags it **[FAIL — CRITICAL]** and explicitly notes the feed-lock
  rule: the audit does not reason about SQL correctness, only the file-level
  ordering deviation from spec.
- Any change is a **SQL migration** and falls under FEED LOCK: no TS-side
  compensation allowed, fix must be verified by the Tier-0 invariant sweep.

## What the ruling must cover

The order difference is semantic, not stylistic: *which* rows a page returns
differs between "dedup the candidate set, then cursor/order/limit" vs
"cursor/order, dedup, limit". The ruling decides which is *correct product
behavior* for pagination + duplicate suppression — per project rules this
document deliberately does **not** argue which order is right.

## Options

### A — Migration to spec order
Rewrite the stage order in a new migration so dedup follows ordering per
§1. **Effort: M** (migration + live verification + playwright feed-spec
re-run). Tradeoff: spec stays authoritative as written; pagination content
changes — any client assumptions about the current order break (they're
SQL's problem by design, but page-boundary behavior will visibly shift).

### B — Amend spec §1 to match live order
Document `dedup → cursor+ordering → limit` as intended. **Effort: S**
(docs). Tradeoff: zero migration risk; but this bakes in an order the
original spec author ordered differently — needs a stated reason *why* live
order is preferable, else it's ratifying a drift.

### C — Leave deviating + document as known deviation
**Effort: S.** Tradeoff: closes nothing — AUDIT-02's CRITICAL stays open;
every future audit re-flags it.

## Recommendation

No recommendation on the *order itself* — that is precisely the ruling being
requested, and the feed-lock rule bars this document from arguing SQL
correctness. Process recommendation: the ruling should state the intended
semantic (which duplicates should be suppressed relative to page boundaries),
then A or B follows mechanically.

*This is a request for a ruling, not a technical recommendation.*

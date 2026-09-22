# NEEDS-SPEC N2 — YouTube comments import (§41.3.1)

**Status:** proposal — awaiting decision. No implementation has been done.

## The decision

Whether and in what scope to build import of a user's YouTube comments as
LIKED nodes — and, critically, whether the YouTube Data API can even deliver
what §41.3.1 describes.

## Hard constraints already in spec

- §41.3.1: comments are modeled **as nodes** (`node_type='comment'` +
  `parent_node_id` → parent video node; NULL parent allowed when the video
  isn't saved). Schema is **already shipped** (migrations 098–100,
  IMPL-NODE-TYPE-01).
- Comments import is subject to the same **review-before-write gate** as
  liked-video categorization (existing Phase B policy).
- §41.3.3: comments *categorization* is **out of Phase B initial ship**.
- §41.5: `parent_node_id` semantics as above are CTO-decided.

## Material technical finding (affects the decision itself)

§41.3.1 names `commentThreads.list` / `comments.list` and scope "user's own
written comments **and liked comments**". YouTube Data API v3 reality:

- `commentThreads.list` supports `allThreadsRelatedToChannelId` / `channelId` /
  `videoId` / `id` — i.e., comments **on** a channel's videos, not comments
  **authored by** the user on other channels. There is no author=me filter.
- There is **no endpoint for "comments I liked"** — liked-comments retrieval
  is only available via Google Takeout export, not the Data API.

So the spec's stated mechanism cannot deliver its stated scope in the general
case; only "comments on the user's own channel" is API-reachable.

## Options

### A — Narrow scope to what's API-reachable
Import comment threads on the user's own channel videos
(`allThreadsRelatedToChannelId=mine`), create comment nodes with
`parent_node_id` set when the parent video node exists. **Effort: M.**
Tradeoff: honest scope cut — delivers only users who are creators with a
channel; most consumers get nothing.

### B — Takeout-based import path
Parse Google Takeout's comment export (HTML/CSV) via an upload surface, map to
comment nodes. **Effort: L.** Tradeoff: covers "own written comments" broadly
but adds an upload/parsing surface, a new UX flow, and Takeout export lag —
and §41.6 already defers "Google Takeout / Maps-likes import" as out of this
amendment's scope, so B partially contradicts an explicit deferral.

### C — Defer comments import entirely
**Effort: S.** Tradeoff: §41.3.1 stays unbuilt; schema support (already
shipped) sits dormant. Cheap now, but onboarding/vision narrative (§41.1)
loses a differentiator.

## Recommendation

**Option C now, revisit after Phase B (N4).** The API gap means A delivers a
thin slice at M cost, and B conflicts with the §41.6 Takeout deferral. If the
CTO still wants it this cycle, choose **A with amended spec wording** (scope:
"comments on the user's own channel"), not the current wording.

*This is a recommendation, not a decision.*

---

## Triage (PHASE3-PURGE-MERGE-SPECTRIAGE-001)

**Tier 1 — proposed default: defer + amend §41.3.1.** Confirmed: the spec's
stated scope is **impossible as written**, not merely difficult — Data API v3
has no author-scoped comment listing and no liked-comments endpoint at all;
the only data path for the stated scope is Google Takeout, which §41.6
already defers out of scope. The convention (§41.6 deferral of Takeout-class
imports) resolves the open question: **defer comments import; amend §41.3.1
wording** to either narrow scope to "comments on the user's own channel" or
mark the feature deferred pending a Takeout decision. Schema support
(`node_type`/`parent_node_id`, migrations 098–100) stays dormant — harmless.
Proposed default; will proceed unless told otherwise.

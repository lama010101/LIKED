# NEEDS-SPEC N4 — Phase B LLM auto-categorization (§41.3.3 / §41.5)

**Status:** proposal — awaiting decision. No implementation has been done.

## The decision

The infra/cost approach for the spec-committed Gemini categorization of
imported liked videos — where the LLM call runs, which model, and how
cost/quota is bounded.

## Hard constraints already in spec

- §41.3.3: **Gemini-based**, **review-before-write**, **liked-videos-only**
  scope for initial ship. These three are decided — the open question is
  *how*, not *whether*.
- Comments categorization is explicitly out of initial ship (§41.3.3).
- Project rule: no logic outside DB for feed/visibility — categorization is a
  write-path enrichment, so review-gated writes must still go through the
  existing cause→edges write RPCs (write-system rule).
- Existing server-side AI-call precedent: `extract-node-metadata` lives in a
  Supabase Edge Function (`supabase/functions/`); YouTube API calls currently
  run through Next.js routes (`app/api/youtube/search`) with tokens in
  `youtube_connections`.

## Options

### A — Supabase Edge Function, Gemini Flash, batch sweep
Edge Function (service-role) sweeps uncategorized liked-video nodes, calls
Gemini, stages suggestions into a review table; user review writes via
existing RPCs. **Effort: M.** Tradeoff: matches existing edge-function
precedent and isolates the Google key server-side; adds a scheduled trigger
(pg_cron or manual) and a suggestions/review table — new schema surface.

### B — Next.js route, Gemini Flash, on-demand at import time
Categorize during/right after import via a route handler; suggestions held
for the same review gate. **Effort: S–M.** Tradeoff: no new infra or
scheduler; but categorization inline in import slows the import path and
couples quota failures to a user-facing flow.

### C — Cheap heuristic tier first (no LLM)
Group by YouTube `categoryId` + channel only; LLM upgrade later.
**Effort: S.** Tradeoff: zero cost, zero new infra, ships the *shape* of
onboarding pre-population (helps N3 option B); but it's not the spec'd Gemini
categorization — a spec amendment would be needed if this becomes the answer
rather than a stepping stone.

## Cost note (for the decision, whichever option)

Gemini Flash-class pricing is ~per-million-token; per-user import volume is
bounded by liked-video count. The real cost decision is **review UX volume**:
review-before-write means every suggestion is a UI item — batch size limits
matter more than token price.

## Recommendation

**Option B** for first ship (least new infra, key stays server-side, fails
soft), structured so the call can move to A's batch sweep if volume demands
it. If onboarding (N3-B) ships first, **Option C** can stand in as the
pre-population mechanism until the LLM path exists.

*This is a recommendation, not a decision.*

---

## Triage (PHASE3-PURGE-MERGE-SPECTRIAGE-001)

**Tier 1 — proposed default: Option B (Next.js route, on-demand at import).**
§41.3.3 already decided the *what* (Gemini, review-before-write,
liked-videos-only) — the residual is plumbing, and the codebase supplies the
precedent: Google-API calls already run server-side in route handlers with
stored tokens (`app/api/youtube/search` → `lib/youtube/client.ts`, shipped as
YT-SEARCH-001). A route keeps the key server-side, adds no scheduler, and
fails soft. The review-gate surface (suggestions store + review UI) is the
same under any option. Escalate to an edge-function batch sweep (Option A)
only if import volume makes synchronous calls hot. Proposed default; will
proceed unless told otherwise.

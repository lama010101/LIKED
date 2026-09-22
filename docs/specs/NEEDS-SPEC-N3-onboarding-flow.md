# NEEDS-SPEC N3 — Onboarding flow (§41.4)

**Status:** proposal — awaiting decision. No implementation has been done.

## The decision

Whether to build the spec'd first-run onboarding sequence now, in full or in
reduced form.

## Hard constraints already in spec (§41.4)

- Sequence is fixed: Google-OAuth signup → background import of liked
  videos/subscriptions → template picker (reuses §11.3d folder-template
  mechanism; templates "Funny videos", "Music", "Movies & TV", others TBD) →
  pre-populate selected template folder from imported likes where
  category/tag match exists → prompt in-app YouTube search (§41.3.2 — **already
  shipped**, YT-SEARCH-001) → prompt share folder with one friend (reuses §17
  direct-share).
- Steps 3–6 are **skippable at every step**; skipping lands on the empty-state
  feed (existing behavior).
- §41.4 says "templates: … others TBD" — the template *catalog* itself is
  not fully spec'd.

## Dependencies

- N1 (Google-OAuth-only auth) — step 1 presumes it.
- Background import of likes/subscriptions — needs a YouTube import pipeline
  that exists in some form (`youtube_connections` + import actions exist;
  whether a *background* job path exists should be verified at build time).
- Pre-population "where category/tag match exists" presumes categorization
  output — coupled to N4 (Phase B LLM categorization) unless a simpler
  mapping (YouTube `categoryId`) is accepted.

## Options

### A — Build the full spec'd flow
All steps incl. template picker, category-matched pre-population, and the two
prompts. **Effort: L.** Tradeoff: realizes §41.1's "first experience" wedge
exactly; but couples to N1 *and* N4 — pre-population quality is poor without
categorization, so full-A before N4 ships a hollow version of step 4.

### B — Reduced v1 onboarding
OAuth signup (after N1) → background import → land on feed with a single
dismissible "create a folder from your likes" CTA using YouTube `categoryId`
grouping (no template picker, no share prompt). **Effort: M.** Tradeoff:
violates the letter of §41.4 (missing steps) but every step is skippable
anyway per spec — B is arguably "all steps skipped by default + one CTA";
delivers the growth-loop essence without N4.

### C — Defer onboarding entirely
**Effort: S.** Tradeoff: §41.1's core wedge stays unrealized; pivot narrative
(YouTube-core) has no first-run expression. Cheapest, but strands the pivot's
main product claim.

## Recommendation

**Option B** — a reduced flow delivers the import-into-structural-UI moment
(the actual wedge) without pretending categorization exists. Revisit full A
after N4 lands and the template catalog is decided. If the CTO wants the
spec'd sequence verbatim, that is A — and it should wait on N4.

*This is a recommendation, not a decision.*

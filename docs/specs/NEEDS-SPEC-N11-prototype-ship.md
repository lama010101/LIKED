# NEEDS-SPEC N11 — Prototype ship decision (`app/prototype/`)

**Status:** proposal — awaiting decision. No implementation has been done.

## The decision

Ship, keep-unlinked, or delete the Pinterest-style prototype home that exists
in the working tree but has never been committed.

## Verified existence + cost check (2026-09-22)

- `app/prototype/` — **present, untracked**, ~41K: `page.tsx` (auth-gated
  SSR, reuses `getFeed`/`buildFeedParams`) + `_components/` (PrototypeHome,
  PinGrid, PinCard, pinMapper, icons).
- `public/prototype/` — **present, untracked**, ~1.7MB of stock images (30
  files).
- **Current cost sitting unshipped: zero.** Untracked → not in bundle, not in
  build, not deployed. The only real cost is dirty-tree noise and the risk of
  accidental commit.
- If committed: +1.7MB repo/deploy weight, one new route (27→28), and the
  images become publicly served under `/prototype/…` (public dir is
  unauthenticated static).
- `LANDING-001` already shipped (`63d749c`): `/` is a public landing page —
  the prototype would occupy a *second* "home-style" surface, not the same
  slot.

## Options

### A — Commit and ship at `/prototype`
**Effort: S** (it's built; just commit). Tradeoff: a second home surface live
in prod — product question: is a Pinterest-grid home a real surface or a
spike? Images add 1.7MB static weight forever; route is auth-gated per
page.tsx, but the `public/` assets are public.

### B — Delete the prototype dirs
**Effort: S.** Tradeoff: cleanest — landing already covers the public-home
need; 1.7MB of stock imagery never enters history. Loses the spike work (it's
uncommitted — deletion is unrecoverable).

### C — Commit but keep unlinked
**Effort: S.** Tradeoff: preserves the spike in history without exposing a
nav path; still carries the 1.7MB and a live-but-unlisted route. Worst of
both if the answer is ultimately "not a product surface".

## Recommendation

**Option B** — the shipped landing page already owns the surface this was
prototyping, and keeping 1.7MB of stock photos plus a parallel home component
is pure carry cost. If the CTO sees the pin-grid as a future feed variant
worth keeping, then A — but decide that as a product question, not by
default-keeping the code.

*This is a recommendation, not a decision.*

---

## Triage (PHASE3-PURGE-MERGE-SPECTRIAGE-001)

**Tier 1 — proposed default: do not ship; delete the untracked dirs
(Option B).** The repo's convention is spec-driven surfaces — nothing in the
PRD or feed spec describes a Pinterest-grid home, and `LANDING-001` already
owns the public `/` surface it was prototyping. Uncommitted spike code
entering the repo would be permanent carry cost (1.7MB images + a parallel
home) for an unspec'd surface — the hygiene default resolves it. Caveat made
explicit: the dirs are **untracked**, so deletion is unrecoverable — if the
pin-grid is a wanted future direction, say so and Option A/C applies instead.
Proposed default; will proceed unless told otherwise.

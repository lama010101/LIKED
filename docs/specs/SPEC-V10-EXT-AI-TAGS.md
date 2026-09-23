# SPEC V10 — Extension AI-suggested tags (06 PRD §24 Q4)

**Status:** spec proposal — no implementation. 06 §24 Q4 is explicitly
open; §11 lists AI tags as P2.

## The decision

Whether the extension popup suggests tags from page content (AI), and
where that sits relative to P0 save-flow work.

## Design

- **Server-side suggestion endpoint** — e.g.
  `POST /api/extension/tag-suggest` taking `{ url, title, description? }`,
  reusing `lib/ai/openrouter.ts` (the categorize path already calls an
  OpenRouter model with OPENROUTER_API_KEY, env-wired in
  COMPLETE-APP-002 A1a). Returns up to N suggested labels.
- **Review-before-write (hard rule):** suggestions render as unselected
  chips in the popup's existing tag row; the user taps to accept. AI
  never writes tag_edges on its own — the atomic `import_url` write only
  includes user-accepted tags.
- **Quota guard:** bound to the OpenRouter free tier (~50 req/day
  per key) — suggest on popup open, once per URL, cached client-side;
  degrade silently to zero suggestions on 429/error (never block save).
- **Placement:** suggestions appear inside the existing tag chip rail —
  visually marked (sparkle icon or dashed outline) so users can tell
  suggestion vs their own tags.

## Options

- **P2 per 06 §11 (recommended):** build after the extension is
  production-installed and stable; P0 correctness (pairing, save,
  dedupe) outranks suggestion UX.
- **Fold into P1 popup-polish batch** only if the P1 milestone grows.

## Open questions for owner

- Suggestion count cap (recommend 5) and whether channel/domain heuristics
  (e.g. youtube.com → "YouTube") run before/without the model call —
  recommend heuristics first (free, deterministic), model fills the rest.

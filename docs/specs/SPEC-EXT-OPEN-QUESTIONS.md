# SPEC — Extension open questions (06 PRD §24)

**Status:** spec — formalizes answers the implementation already embodies;
proposes PRD amendment text. No code changes.

| Q | Question (06 §24) | Answer embodied by current impl | PRD amendment text |
|---|---|---|---|
| Q1 | Collection picker — multi-select? | **Single-select** `<select>` in `popup.ts`; one collection per save | "The collection picker is single-select in v1; multi-collection save is deferred." |
| Q2 | Duplicate save handling | **No merge** — popup shows "Already saved — Open in LIKED" (dup detection via `import_url`'s `DUPLICATE_NODE` on `UNIQUE(url,owner_id)`) | "Duplicate saves surface an 'Already saved' state with an Open-in-LIKED action; no metadata merge occurs." |
| Q3 | Note field | **Blank by default**, optional | "The note field is optional and defaults to empty." |
| Q5 | YouTube URL normalization | Save the **canonical watch URL** (`youtube.com/watch?v=…`) regardless of share/embed/shorts form | "YouTube saves store the canonical watch URL; share/embed/shorts forms normalize before save." |
| Q4 | AI-suggested tags | → `SPEC-V10-EXT-AI-TAGS.md` | — |
| Q6 | Notes per node | **Resolved** — one note per node per user (migration 065 UNIQUE constraint) | "One note per node per user." |

## Evidence pointers

- `extension/src/popup/popup.ts` — save flow, dup state, tag chips.
- `supabase/migrations/065_*.sql` — notes uniqueness.
- `import_url` — `DUPLICATE_NODE` on `(url, owner_id)` conflict.

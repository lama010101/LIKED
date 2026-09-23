# SPEC — Full onboarding (§41.4 steps 3–6 + V3 share step)

**Status:** spec proposal — beyond the N3 reduced-v1 shipped in
COMPLETE-APP-002 A4. No implementation.

## What shipped (reduced v1, migration 107)

- OAuth → background import of liked videos (`importYouTubeActivity` →
  atomic `import_url`; idempotent on `UNIQUE(url,owner_id)`;
  resumable — `onboarding_imported_at` set only after the final page).
- One CTA → ONE folder "My YouTube Likes" (name editable) via
  `create_folder_with_nodes`.
- Dismissal persisted (`onboarding_dismissed_at`); only users created
  after the migration ever see it (backfill = `now()`).

## §41.4 remaining steps to spec

| Step | Design decision needed |
|---|---|
| 3 — Template catalog | Which preset folder templates are offered to a new user beyond "My YouTube Likes". Candidates from §11.3d v1 presets (Read Later / Watch List / Trip Planner / Book Notes) vs domain catalog ("Funny videos", "Music", "Movies & TV" — TBD). Recommend reusing the §11.3d preset set via `create_folder_template` rather than a parallel catalog. |
| 4 — Pre-population / matching | How imported likes are matched into suggested folders: N4 categorization output vs YouTube `categoryId`. Recommend: `categoryId` mapping first (free, deterministic — already on the payload), N4 LLM categories as v1.1. |
| 5 — Share-one-folder-with-one-friend (V3) | Placement: last step of onboarding vs post-onboarding nudge. Uses live `share_folder` RPC (p_permission view/contribute/edit/admin). Recommend view-only default + skip button; target = first friend if one exists, else skip silently. |
| 6 — Follow/invite friends | Invite-link flow (no contacts import). Owner decision on whether invites are v1 or deferred entirely. |

## Interaction constraints (from A4)

- Import idempotency/resume logic is reused unchanged — the full flow
  layers on top of the same `onboarding_imported_at` gate.
- Single-folder N3 ruling is literal for v1; steps 3–4 add *suggested*
  templates — they must not auto-create folders without an explicit
  confirm per template.

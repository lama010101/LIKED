# LIKED — Build Progress Tracker

**Purpose:** Source of truth for execution state. Updated by Lolo after each task is confirmed complete by Cascade.
**Rule:** Claudi reads this file first in every session before issuing any prompt.

---

## ⚡ CURRENT STATUS

| Field | Value |
|-------|-------|
| **Last completed task** | P5-T01-D (BottomBar component) |
| **Next task to execute** | Add Horizontal Rows view mode to complete P5-T03 |
| **Current phase** | P5 — UI Shell |
| **Phase gate passed** | ❌ No (missing 1 view mode) |
| **Last updated** | 2026-04-18 (Cascade review) |

---

## TASK LOG

### PHASE 1 — Foundation
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P1-T01 | Initialize Next.js 15 project | ✅ | |
| P1-T02 | Deploy complete database schema | ✅ | |
| P1-T03 | Supabase Auth integration | ✅ | |
| P1-T04 | Deterministic default avatar | ⚠️ | File at lib/utils/avatar.ts not lib/avatar.ts — acceptable |
| P1-T05 | Seed data | ✅ | |
| CLEANUP-C | middleware.ts at project root | ✅ | Was missing, now restored |
| **P1 Gate** | | ✅ | |

### PHASE 2 — Core Feed
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P2-T01 | Visibility query function | ✅ | lib/db/visibility.ts correct |
| P2-T02 | Node creation API | ✅ | lib/db/nodes.ts exists |
| P2-T03 | Basic feed page | ✅ | app/(app)/feed/page.tsx exists |
| P2-T04 | Quick node creation (temp input) | ✅ | AddNodeBar exists |
| **P2 Gate** | | ✅ | |

### PHASE 3 — Sharing System
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P3-T01 | Direct share write | ✅ | Cleaned via CLEANUP-B |
| P3-T02 | Unshare (cause deletion) | ✅ | |
| P3-T03 | Friends derived from edges | ⚠️ | Coder built friend_invites table instead of edge-derived — accepted as additive |
| P3-T04 | Group share + group creation | ✅ | |
| P3-T05 | RLS policies (tightening) | ✅ | migration 003 correct |
| CLEANUP-A | Restore folder_admins + group_admins | ✅ | migration 012 |
| CLEANUP-B | Strip rogue permissions layer | ✅ | sharing.ts + CardDetailModal.tsx |
| **P3 Gate** | | ⚠️ | Friends model deviated — does not block P4/P5 |

### PHASE 4 — Folders
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P4-T01 | Folder CRUD | ⚠️ | lib/db/folders.ts exists; folder_admins was dropped but restored |
| P4-T02 | Folder share (write expansion) | ✅ | share_folder RPC exists |
| P4-T03 | Breadcrumb navigation | ✅ | BreadcrumbNav component created |
| P4-T04 | Nested folder feed | ✅ | Folder feed query confirmed |
| **P4 Gate** | | ✅ | |

### PHASE 5 — UI Shell
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P5-T01-A | TopBar component | ✅ | components/bars/TopBar.tsx |
| P5-T01-B | BottomBar component | ✅ | components/bars/BottomBar.tsx |
| P5-T01-C | DesktopSidebar component | ✅ | components/sidebar/DesktopSidebar.tsx |
| P5-T01-D | App layout integration | ✅ | app/(app)/layout.tsx with all bars integrated |
| P5-T01 | Bars layout (complete) | ✅ | All subtasks A-D done |
| P5-T02 | FAB + Create modal | ✅ | FAB in layout, AddCardSheet.tsx 499 lines complete |
| P5-T03 | Five view modes | ⚠️ | 4/5 done (col, mason, list, free). Missing: Horizontal Rows |
| P5-T04 | Profile modal | ✅ | ProfileModal.tsx 483 lines complete, integrated |
| **P5 Gate** | | ❌ | Blocked on P5-T03 (Horizontal Rows view mode) |

### PHASE 6 — Tags & Ratings
| Task ID | Title | Status | Notes |
|---------|-------|--------|-------|
| P6-T01 | Tag creation and assignment | ✅ | lib/db/tags.ts exists |
| P6-T02 | Rating system | ✅ | lib/db/ratings.ts exists |
| P6-T03 | Sort system | ⏳ | Not yet verified |
| **P6 Gate** | | ❌ | Blocked on P5 |

### PHASES 7–13
| Phase | Status |
|-------|--------|
| P7 Advanced Interactions | ⏳ Not started |
| P8 Media & Cards | ⚠️ CardDetailModal.tsx exists (149 lines, stubbed) |
| P9 Search & Filters | ⏳ Not started |
| P10 Realtime & Notifications | ⏳ Not started |
| P11 Advanced Views | ⏳ Not started |
| P12 Admin & Permissions | ⏳ Not started |
| P13 Chat | ⏳ Deferred — do not start until P1–P12 gates pass |

---

## KNOWN DEVIATIONS FROM SPEC (accepted, monitored)

| Item | Deviation | Decision |
|------|-----------|----------|
| lib/utils/avatar.ts | Wrong path vs spec lib/avatar.ts | Accepted — harmless |
| migration 010 | Added permission column to edges, is_project + color_hex to folders | Accepted — additive, safe defaults |
| migration 011 | friend_invites table instead of edge-derived friends | Accepted — revisit at P5-T01 |
| components location | Feed components in app/(app)/feed/_components/ | Accepted — enforce correct location going forward |
| permissions.ts | File exists but unused | Leave in place, never import |

---

## STRICT RULES FOR CODER (repeat in every prompt)

1. One function or one component per prompt — never combine.
2. Every prompt must have an explicit DO NOT section.
3. Coder must show complete final file contents after every change.
4. Never reference task IDs that don't exist in 02_BUILD_PLAN.md.
5. Never add columns, tables, RPC functions, or dependencies not explicitly requested.
6. Never modify files not explicitly named in the prompt.

---

## BLOCKERS / NOTES

- **Current blocker:** P5-T03 missing Horizontal Rows view mode (4/5 complete: col, mason, list, free)
- permissions.ts left in place unused — do not import it anywhere in new code
- friend_invites model (migration 011) deviates from PRD §9 — accepted deviation
- migration 010 dropped folder_admins and group_admins — restored via migration 012
- CardDetailModal exists but stubbed — needs full implementation per P8

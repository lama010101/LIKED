# DOCS — Authority Matrix

Status legend: `authoritative-spec` = build to this · `current-status` = live tracking/active plan · `historical` = point-in-time record, kept for history · `reference-only` = informative, not spec · `superseded` = replaced by a named doc, kept for rationale

| File | Status | One line |
|------|--------|----------|
| `01_PRD.md` | authoritative-spec | Merged unified PRD v28.0 (v25.0 + UIX v26.0 + §41 v28.0) — the product spec |
| `02_BUILD_PLAN.md` | authoritative-spec | Phased build plan, companion to PRD v28.0 |
| `03_TECHNICAL_ARCHITECTURE.md` | authoritative-spec | Technical architecture + decisions log, companion to PRD v28.0 |
| `04_FEED_SQL_SPEC.md` | authoritative-spec | Feed SQL pipeline + `get_feed` contract; sidebar-query drift annotated |
| `05_CHROME_EXTENSION_ATOMIC_PLAN.md` | authoritative-spec | Extension implementation plan (proposed/ready) |
| `06_CHROME_EXTENSION_PRD.md` | authoritative-spec | Extension PRD (authoritative / draft-for-review) |
| `00_PROGRESS.md` | current-status | Source of truth for execution state; status taxonomy defined inside |
| `UIX-PORT-PLAN.md` | current-status | UIX-PORT-00: PROTO V2 → production port plan (active) |
| `AUDIT-01-REPORT.md` … `AUDIT-08-REPORT.md` | historical | Point-in-time audit reports; open findings tracked in 00_PROGRESS.md |
| `Youtube_Activity_Amendment.md` | superseded | Superseded by `01_PRD.md` §41 — Option B + comments non-goal do not reflect merged spec |
| `UI/` | reference-only | HTML prototypes (PROTO V2 etc.) referenced by port plan — not spec |
| `prompt_template FOR CTO ONLY.txt` | reference-only | Prompt template for CTO use |
| `archive/` | historical | Quarantined docs — see below |

## archive/

| File | Status | One line |
|------|--------|----------|
| `archive/DATABASE_CONNECTION.md` | superseded | Wrong project (`prompts` table, `SUPABASE_DB_*` envs) — do not use |
| `archive/ROADMAP.md` | historical | 2026-08-09 roadmap; superseded by `00_PROGRESS.md` |
| `archive/architecture_audit.md` | historical | Early audit; superseded by AUDIT-01..08 reports |
| `archive/UIX_VERIFICATION_AND_IMPLEMENTATION_PLAN.md` | historical | 2026-04-29 UIX gap analysis; UIX v26.0 merged into `01_PRD.md` |
| `archive/UI (for reference only)/` | historical | Older HTML/image prototypes |

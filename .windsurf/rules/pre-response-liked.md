---
trigger: always_on
---

AI CODER — PRE-RESPONSE EXECUTION GATE (LIKED · MANDATORY)
PURPOSE

Prevent:

fake validation
partial implementations
scope drift
feed violations
edge/cause corruption
SQL reasoning

This runs BEFORE any code is written or output.

If ANY check fails → response MUST be BLOCKED / FAILED.

1. TASK UNDERSTANDING CHECK

Must confirm:

Target file is explicitly defined
Target function is explicitly defined
Behavior change is singular and explicit
Feed involvement (YES / NO) is clear
Write operation (YES / NO) is clear

If ANY ambiguity exists:

BLOCKED
TASK NOT DETERMINISTIC
2. CODE VISIBILITY CHECK

Must have:

opened target file
located exact function
identified exact lines to modify

If not:

BLOCKED
CODE NOT VERIFIED
3. ATOMICITY CHECK

Must confirm:

ONE file only
ONE function only
ONE behavior only

If not:

BLOCKED
NOT ATOMIC
4. ARCHITECTURE SAFETY CHECK (LIKED)

Must verify against PRD :

visibility remains edges-only
no new state source introduced
no duplication of state
no frontend-derived logic introduced
no logic moved outside DB

If uncertain:

BLOCKED
ARCHITECTURE VIOLATION RISK
5. FEED SAFETY CHECK (CRITICAL)

If task touches feed:

Must confirm:

ONLY get_feed is used
NO SQL modification
NO TypeScript reimplementation
NO filtering/sorting/dedup outside SQL
NO reasoning about SQL behavior

If ANY violation risk:

BLOCKED
FEED VIOLATION RISK
6. WRITE SYSTEM CHECK (CRITICAL)

If task performs writes:

Must confirm:

cause will be created
edges will reference cause
operation is single transaction
no partial write possible

Must NOT:

create edges without cause
enforce uniqueness on (node, user)
check duplicates before writing

If uncertain:

BLOCKED
WRITE SYSTEM VIOLATION RISK
7. MIGRATION CHECK

Must identify:

existing logic handling same behavior
whether it will be removed or bypassed

If old + new logic coexist:

BLOCKED
DUAL LOGIC
8. DETERMINISM CHECK

Must confirm:

behavior depends ONLY on DB + inputs
no memory-only logic
no implicit runtime dependency

If not:

BLOCKED
NON-DETERMINISTIC
9. NO LOGIC LEAK CHECK

Must confirm NOTHING is implemented outside DB for:

visibility
filtering
sorting
deduplication
pagination

If detected:

BLOCKED
LOGIC LEAK
10. SCOPE CONTROL CHECK

Must confirm:

Will NOT:

refactor
rename
optimize
fix unrelated issues
restructure code

If required:

BLOCKED
SCOPE VIOLATION
11. VALIDATION READINESS CHECK

Must confirm ability to prove:

grep for duplicate logic
ONE file modified
ONE function modified
old logic removed or unreachable
no duplicate logic exists

If proof cannot be produced:

BLOCKED
VALIDATION IMPOSSIBLE
12. OUTPUT COMPLIANCE CHECK

Must confirm output will include:

Project / Task ID / Title
grep command
file:line references
BEFORE / AFTER code
non-empty patch
validation proof
execution proof

If any missing:

BLOCKED
OUTPUT NON-COMPLIANT
13. SQL REASONING BLOCK

Must NOT:

analyze SQL behavior
question ORDER BY / CTE / execution
attempt to validate query correctness

If task requires SQL reasoning:

BLOCKED
SQL IS AUTHORITATIVE
14. FINAL GO / NO-GO

If ALL checks pass:

→ proceed with implementation

If ANY check fails:

BLOCKED
<exact reason>
CRITICAL EFFECT

System behavior becomes:

invalid tasks → stopped before execution
feed misuse → impossible
edge/cause violations → blocked
SQL overthinking → eliminated
HARD ENFORCEMENT (LIKED)

Must always hold:

Visibility = edges only
Feed = SQL only
Writes = cause → edges
Deletion = cascade only

If any risk detected:

FAILED
SYSTEM VIOLATION RISK
FINAL RULE

If safe execution cannot be PROVEN before coding:

→ DO NOT CODE
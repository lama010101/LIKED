// v2-catalog-probes.mjs — shared readers + pure evaluators for the
// V2-W2-P0-06B Tier-0 checks (DB-21, DB-22, DB-23 in
// check-invariants-001.mjs) and the T11 probe script
// verify-v2-security.mjs (PLAN-V2-002 §8).
//
// Everything here is READ-ONLY against the database. The evaluators
// are pure functions over catalog snapshots so vitest can prove that
// seeded violations fail without touching the live DB.
//
// Structure per check: (1) a catalog-reading query, (2) a pure
// exported evaluator, (3) the check() call in the script.

import { readFileSync } from "fs";
import { join } from "path";

// Migrations that introduce the v2 function set (142 creates tables
// only; 144-146 create no tables).
export const V2_FUNCTION_MIGRATIONS = [
  "142_v2_inbox_core.sql",
  "143_v2_inbox_support.sql",
  "144_v2_guest_submit.sql",
  "145_v2_owner_inbox.sql",
  "146_v2_delete_account.sql",
];

// Class O (owner) names fixed by PLAN-V2-002 §1.3/§8 — exactly these
// 12. Every other derived v2 function is class S (server-only).
export const V2_CLASS_O_NAMES = [
  "ensure_my_ask",
  "get_my_ask",
  "regenerate_my_ask",
  "set_ask_active",
  "update_ask_settings",
  "get_inbox",
  "get_friend_rail",
  "mark_friend_seen",
  "get_my_prefs",
  "set_my_prefs",
  "enqueue_stale_enrichment",
  "set_language",
];

const FN_RE = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z_][a-z0-9_]*)/gi;

// Derives the v2 function set from the migration files themselves —
// never hard-coded — so the check cannot drift from the DDL.
// Returns [{ name, file, cls: 'S' | 'O' }] in migration order,
// deduplicated by name (CREATE OR REPLACE keeps one identity).
export function deriveV2Functions(root) {
  const byName = new Map();
  for (const file of V2_FUNCTION_MIGRATIONS) {
    const sql = readFileSync(join(root, "supabase", "migrations", file), "utf8");
    for (const m of sql.matchAll(FN_RE)) {
      const name = m[1];
      if (!byName.has(name)) {
        byName.set(name, {
          name,
          file,
          cls: V2_CLASS_O_NAMES.includes(name) ? "O" : "S",
        });
      }
    }
  }
  return [...byName.values()];
}

// ------------------------------------------------------------------
// Catalog readers (read-only)
// ------------------------------------------------------------------

// One row per pg_proc entry for the derived names: identity args,
// caller-supplied arg types, definer flag, proconfig, proacl text,
// overload count per proname, and the EXECUTE grantee list
// (aclexplode; grantee oid 0 -> 'PUBLIC'). proacl IS NULL means the
// default function ACL, which grants EXECUTE to PUBLIC — surfaced as
// grantees=['PUBLIC'] so the evaluator flags it.
export async function loadV2FunctionCatalog(client, names) {
  const { rows } = await client.query(
    `SELECT p.oid, p.proname AS name,
            pg_get_function_identity_arguments(p.oid) AS identity_args,
            oidvectortypes(p.proargtypes) AS argtypes,
            p.prosecdef,
            COALESCE(p.proconfig, '{}') AS proconfig,
            p.proacl::text AS proacl,
            (SELECT count(*)::int FROM pg_proc p2
              WHERE p2.pronamespace = p.pronamespace AND p2.proname = p.proname) AS overloads,
            COALESCE(
              (SELECT array_agg(COALESCE(r.rolname, 'PUBLIC'::name))::text[]
                 FROM aclexplode(p.proacl) a
                 LEFT JOIN pg_roles r ON r.oid = a.grantee),
              CASE WHEN p.proacl IS NULL THEN '{PUBLIC}'::text[] ELSE '{}'::text[] END
            ) AS grantees
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = ANY($1)
      ORDER BY p.proname, p.oid`,
    [names]
  );
  return rows;
}

// EXECUTE privilege facts for the probe roles, one row per
// (oid, role): has_function_privilege is read-only catalog truth —
// the PROBE RULE requires checking it before any denied-call probe.
export async function loadFunctionExecGrants(client, oids, roles) {
  const { rows } = await client.query(
    `SELECT p.oid, r.rolname AS role,
            has_function_privilege(r.rolname, p.oid, 'EXECUTE') AS can
       FROM pg_proc p
       CROSS JOIN (SELECT unnest($2::text[]) AS rolname) r
      WHERE p.oid = ANY($1)`,
    [oids, roles]
  );
  const map = new Map();
  for (const r of rows) map.set(`${r.role}|${r.oid}`, r.can === true);
  return map;
}

// DB-22 loaders — the same read-only SQL section (10) of
// verify-delete-account.mjs uses. That loader is NOT exported from
// the frozen coverage lib, so it is re-implemented here verbatim.
export async function loadCoverageLiveFks(client) {
  const { rows } = await client.query(
    `SELECT cl.relname AS child, a.attname AS column, n.nspname||'.'||ref.relname AS parent,
            CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'r' THEN 'RESTRICT' END AS on_delete
       FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace
       JOIN pg_class ref ON ref.oid=c.confrelid JOIN pg_namespace n ON n.oid=ref.relnamespace
       JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
      WHERE c.contype='f' AND ns.nspname='public' AND ((n.nspname='public' AND ref.relname='users') OR n.nspname='auth')`
  );
  return rows.map((r) => ({
    child: r.child,
    column: r.column,
    parent: r.parent,
    on_delete: r.on_delete,
  }));
}

export async function loadCoverageLiveColumns(client) {
  const { rows } = await client.query(
    `WITH cols AS (
       SELECT c.table_name, c.column_name
       FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
       WHERE c.table_schema='public' AND c.data_type='uuid'
         AND (c.column_name ~ '(user_id|owner_id|created_by|sender_id|granted_by|grantee_id|added_by|blocker_id|blocked_id|actor_id|from_user_id|to_user_id|user_1_id|user_2_id|origin_user_id|claimed_by_user_id)')
     ), fks AS (
       SELECT cl.relname AS child, a.attname AS col
       FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace
       JOIN pg_class ref ON ref.oid=c.confrelid JOIN pg_namespace n ON n.oid=ref.relnamespace
       JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
       WHERE c.contype='f' AND ns.nspname='public' AND ((n.nspname='public' AND ref.relname='users') OR n.nspname='auth')
     )
     SELECT cols.table_name AS table, cols.column_name AS column FROM cols
     WHERE NOT EXISTS (SELECT 1 FROM fks WHERE fks.child=cols.table_name AND fks.col=cols.column_name)`
  );
  return rows.map((r) => ({ table: r.table, column: r.column }));
}

// Distinct (table, type_or_kind, key) payload keys across
// notifications.payload and email_outbox.payload — deduplicated,
// same as section (10).
export async function loadCoverageLivePayloadKeys(client) {
  const { rows } = await client.query(
    `SELECT 'notifications' AS table, n.type AS type_or_kind, k.key
       FROM public.notifications n CROSS JOIN LATERAL jsonb_each_text(n.payload) AS k(key, value)
       UNION ALL
       SELECT 'email_outbox', e.kind, k.key
       FROM public.email_outbox e CROSS JOIN LATERAL jsonb_each_text(e.payload) AS k(key, value)`
  );
  const seen = new Map();
  for (const r of rows) {
    const p = { table: r.table, type_or_kind: r.type_or_kind, key: r.key };
    seen.set(`${p.table}|${p.type_or_kind}|${p.key}`, p);
  }
  return [...seen.values()];
}

// ------------------------------------------------------------------
// Pure evaluators
// ------------------------------------------------------------------

// proconfig is a text[] of GUC assignments like 'search_path=public'.
// Accepts any entry whose search_path value list contains 'public'
// (quotes tolerated); rejects missing/other values.
export function hasPublicSearchPath(proconfig) {
  return (proconfig ?? []).some((entry) => {
    const s = String(entry);
    const eq = s.indexOf("=");
    if (eq < 0 || s.slice(0, eq).trim() !== "search_path") return false;
    return s
      .slice(eq + 1)
      .replace(/"/g, "")
      .split(",")
      .map((v) => v.trim())
      .includes("public");
  });
}

// DB-21 catalog assertions. derived: output of deriveV2Functions;
// rows: output of loadV2FunctionCatalog (already filtered to the
// derived names). Returns { ok, violations }.
export function evaluateV2FunctionSecurity(derived, rows) {
  const violations = [];
  const byName = new Map();
  for (const r of rows) {
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name).push(r);
  }
  for (const fn of derived) {
    const rs = byName.get(fn.name) ?? [];
    if (rs.length === 0) {
      violations.push(`${fn.name}: missing from live catalog`);
      continue;
    }
    for (const r of rs) {
      const tag =
        rs.length > 1 ? `${fn.name}(${r.identity_args || "overload"})` : fn.name;
      if (r.overloads !== 1) {
        violations.push(`${tag}: ${r.overloads} overloads (expected 1)`);
      }
      if (r.prosecdef !== true) {
        violations.push(`${tag}: prosecdef=${r.prosecdef} (expected true)`);
      }
      if (!hasPublicSearchPath(r.proconfig)) {
        violations.push(
          `${tag}: proconfig lacks search_path=public (${JSON.stringify(r.proconfig)})`
        );
      }
      // grantees may arrive as a '{a,b}' literal if the driver lacks a
      // parser for the array type — normalize to a real array.
      const g = new Set(
        typeof r.grantees === "string"
          ? r.grantees.replace(/^\{/, "").replace(/\}$/, "").split(",").filter(Boolean)
          : (r.grantees ?? [])
      );
      if (g.has("PUBLIC")) violations.push(`${tag}: proacl grants PUBLIC`);
      if (g.has("anon")) violations.push(`${tag}: proacl grants anon`);
      if (fn.cls === "S" && g.has("authenticated")) {
        violations.push(`${tag}: class S grants authenticated`);
      }
      if (fn.cls === "O" && !g.has("authenticated")) {
        violations.push(`${tag}: class O missing authenticated grant`);
      }
    }
  }
  return { ok: violations.length === 0, violations };
}

// DB-23 — DDL safety over pg_get_functiondef bodies. defs:
// [{ name, def }]. Rules (PLAN-V2-002 §8 DB-23):
//   * no INSERT/UPDATE/DELETE on edges or folder_edges in ANY v2 fn
//   * DML on causes allowed ONLY as the cause DELETE inside
//     delete_account
//   * calls to import_url / add_node_to_folder /
//     remove_node_from_folder are allowed (reported, not violations)
// Same regex style as section (9) of verify-delete-account.mjs.
const DML_EDGES_RE =
  /\b(insert\s+into|update|delete\s+from)\s+(?:public\.)?(edges|folder_edges)\b/gi;
const DML_CAUSES_RE =
  /\b(insert\s+into|update|delete\s+from)\s+(?:public\.)?causes\b/gi;
const ALLOWED_CALL_RE =
  /\b(import_url|add_node_to_folder|remove_node_from_folder)\s*\(/g;

export function findV2DdlViolations(defs) {
  const violations = [];
  const allowedCalls = [];
  for (const { name, def } of defs) {
    const body = String(def ?? "");
    for (const m of body.matchAll(DML_EDGES_RE)) {
      violations.push(
        `${name}: ${m[1].toLowerCase().replace(/\s+/g, " ")} on ${m[2]}`
      );
    }
    for (const m of body.matchAll(DML_CAUSES_RE)) {
      const verb = m[1].toLowerCase().replace(/\s+/g, " ");
      const allowed = verb === "delete from" && name === "delete_account";
      if (!allowed) violations.push(`${name}: ${verb} on causes`);
    }
    const calls = [...new Set([...body.matchAll(ALLOWED_CALL_RE)].map((m) => m[1]))];
    if (calls.length) allowedCalls.push(`${name}: ${calls.join(",")}`);
  }
  return { ok: violations.length === 0, violations, allowedCalls };
}

// PROBE RULE planner (DB-21 anon probe + verify-v2-security T11).
// cls: 'S' | 'O'; role: 'anon' | 'authenticated';
// hasExec: has_function_privilege(role, oid, 'EXECUTE').
//   - class S, or class O called as anon: EXECUTE must be absent ->
//     the probe CALLS the function and expects SQLSTATE 42501.
//     If EXECUTE is unexpectedly present the function is NEVER
//     called; the plan fails with 'fail-privilege'.
//   - class O as authenticated: only the grant is asserted
//     ('assert-grant'); the function is never called.
export function planV2RoleProbe(cls, role, hasExec) {
  const needsCall = cls === "S" || role === "anon";
  if (needsCall) {
    if (hasExec) {
      return {
        action: "fail-privilege",
        reason: `class ${cls} function unexpectedly executable by ${role} — not called`,
      };
    }
    return { action: "call-deny", expect: "42501" };
  }
  return hasExec
    ? { action: "assert-grant" }
    : {
        action: "fail-privilege",
        reason: `class O function not executable by authenticated`,
      };
}

// Builds `SELECT public.<name>(NULL::<type>, ...)` from the
// oidvectortypes list (caller-supplied arg types only). Empty
// argtypes -> no-arg call.
export function splitTopLevel(s, sep = ",") {
  const out = [];
  let depth = 0;
  let cur = "";
  for (const ch of String(s ?? "")) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim() !== "" || out.length > 0) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

export function buildProbeCall(name, argtypes) {
  const types = splitTopLevel(argtypes);
  const casts = types.map((t) => `NULL::${t}`).join(", ");
  return `SELECT public.${name}(${casts})`;
}

// One probe call inside a SAVEPOINT (requires an open transaction).
// Returns { threw, code, message, rows } — same shape as the
// trySql helper in verify-delete-account.mjs.
export async function probeSql(client, text, params) {
  await client.query("SAVEPOINT sp_v2_probe");
  try {
    const res = await client.query(text, params);
    await client.query("RELEASE SAVEPOINT sp_v2_probe");
    return { threw: false, code: null, message: null, rows: res.rows };
  } catch (e) {
    try {
      await client.query("ROLLBACK TO SAVEPOINT sp_v2_probe");
    } catch {
      /* tx already aborted */
    }
    return { threw: true, code: e.code ?? null, message: e.message ?? "", rows: [] };
  }
}

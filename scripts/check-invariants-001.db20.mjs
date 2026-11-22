// DB-20 probe for check-invariants-001.mjs — V2-W2-P0-06A
// (PLAN-V2-002 §1.3, §8 row P0-06). Shared with the rolled-back
// negative test so both execute the identical check logic.
import { readFileSync } from "fs";
import { join } from "path";

export const V2_TABLE_MIGRATIONS = [
  "142_v2_inbox_core.sql",
  "143_v2_inbox_support.sql",
];

// Table list is derived from the migration files themselves — never
// hard-coded — so the check cannot drift from the DDL.
export function deriveV2Tables(root) {
  const tables = [];
  for (const file of V2_TABLE_MIGRATIONS) {
    const sql = readFileSync(join(root, "supabase", "migrations", file), "utf8");
    for (const m of sql.matchAll(/CREATE TABLE public\.([a-z_]+)/g)) {
      tables.push(m[1]);
    }
  }
  return tables;
}

// Returns { ok, detail }. ok=false on: missing table, RLS disabled,
// any pg_policies row, or any anon/authenticated entry in
// information_schema.role_table_grants.
export async function probeV2TableSecurity(client, tables) {
  const present = await client.query(
    `SELECT c.relname::text AS t, c.relrowsecurity AS rls
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relname::text = ANY($1)`,
    [tables]);
  const seen = new Map(present.rows.map((r) => [r.t, r.rls]));
  const missing = tables.filter((t) => !seen.has(t));
  const rlsOff = tables.filter((t) => seen.get(t) === false);

  const pol = await client.query(
    `SELECT tablename::text AS t FROM pg_policies
      WHERE schemaname = 'public' AND tablename::text = ANY($1)`,
    [tables]);
  const policies = [...new Set(pol.rows.map((r) => r.t))];

  const grants = await client.query(
    `SELECT table_name::text AS t, grantee, privilege_type
       FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name::text = ANY($1)
        AND grantee IN ('anon', 'authenticated')`,
    [tables]);
  const grantHits = grants.rows.map((r) => `${r.t}:${r.grantee}:${r.privilege_type}`);

  const problems = [];
  if (missing.length) problems.push(`missing: ${missing.join(",")}`);
  if (rlsOff.length) problems.push(`rls-off: ${rlsOff.join(",")}`);
  if (policies.length) problems.push(`policies: ${policies.join(",")}`);
  if (grantHits.length) problems.push(`grants: ${grantHits.join(",")}`);

  return { ok: problems.length === 0, detail: problems.join("; ") || `${tables.length} tables clean` };
}

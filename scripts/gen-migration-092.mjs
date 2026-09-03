// Generate supabase/migrations/092_fix_rpc_authz.sql.
//
// AUDIT-08 P0: 42 SECURITY DEFINER RPCs accept caller-supplied user IDs
// without validating against auth.uid() → IDOR (read any user's data,
// impersonate any user for writes).
//
// Method: pull the EXACT current function definition from the remote DB
// via pg_get_functiondef (source of truth), inject an auth.uid() gate at
// the top of each body, and emit CREATE OR REPLACE statements.
//
// Gate (role-agnostic):
//   IF auth.uid() IS NOT NULL AND <user_param> IS DISTINCT FROM auth.uid() THEN
//     RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
//   END IF;
// - authenticated callers (auth.uid() set) must pass their own user id
// - service_role calls (auth.uid() NULL) pass through unchanged
//
// Usage: node scripts/gen-migration-092.mjs  (writes the migration file, does NOT apply)

import { config } from "dotenv";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env.local") });

const LIKED_REF = "lzkzfqshnjvlzosnntfx";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!SUPABASE_URL || !SUPABASE_URL.includes(LIKED_REF)) {
  console.error("ABORT: .env.local not pointing at LIKED project");
  process.exit(3);
}

// ── function → user-id parameter to gate ─────────────────────
const GATE_ON = {
  // IDOR-READ (user-id scoped)
  get_feed: "p_user_id",
  get_social_timeline: "p_user_id",
  get_user_folders: "p_user_id",
  get_folder_tree: "p_user_id",
  get_visible_node_by_id: "p_user_id",
  get_visible_nodes: "p_user_id",
  get_friend_bar: "p_user_id", // LANGUAGE sql → converted to plpgsql
  get_node_friend_ratings: "p_user_id",
  get_visible_tags: "p_user_id",
  get_nodes_in_folder: "p_user_id",
  is_folder_admin: "p_user_id",
  is_group_admin: "p_user_id",
  folder_is_accessible: "p_user_id",
  folder_is_owned: "p_user_id",
  group_is_member: "p_user_id",
  group_is_owned: "p_user_id",
  get_node_permission: "p_user_id",
  get_folder_permission: "p_user_id",
  has_node_permission: "p_user_id",
  has_folder_permission: "p_user_id",
  // IDOR-WRITE (user-id scoped)
  hard_delete_node: "p_user_id",
  move_node_to_folder: "p_user_id",
  create_folder_with_nodes: "p_user_id",
  get_or_create_unsorted_folder: "p_user_id",
  get_or_create_named_folder: "p_user_id",
  // create_user_profile: not present on remote (superseded by
  // trigger-based ensure_user_profile() in 013 — no params, safe)
  update_display_name: "p_user_id",
  update_avatar_key: "p_user_id",
  update_node_title: "p_user_id",
  create_node_with_metadata: "p_owner_id",
  import_url: "p_owner_id",
  create_group: "p_owner_id",
  direct_share: "p_sharer_id",
  group_share: "p_sharer_id",
  share_folder: "p_sharer_id",
  group_unshare: "p_sharer_id",
  change_node_permission: "p_requesting_user_id",
  change_folder_permission: "p_requesting_user_id",
};

const GATE_SQL = (param) => `  IF auth.uid() IS NOT NULL AND ${param} IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
  END IF;`;

// ── resource-only functions: hand-written fixes ──────────────
// These take no user-id param; ownership must derive from auth.uid()
// with service-role bypass (auth.uid() IS NULL).
const RESOURCE_FIXES = {
  set_node_deleted: `CREATE OR REPLACE FUNCTION public.set_node_deleted(p_node_id uuid, p_deleted boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE nodes
  SET deleted_at = CASE WHEN p_deleted THEN now() ELSE NULL END
  WHERE id = p_node_id
    AND (owner_id = auth.uid() OR auth.uid() IS NULL);
END;
$function$`,
  delete_folder: `CREATE OR REPLACE FUNCTION public.delete_folder(p_folder_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE folders
  SET deleted_at = now()
  WHERE id = p_folder_id
    AND deleted_at IS NULL
    AND (
      auth.uid() IS NULL
      OR owner_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM folder_admins fa
        WHERE fa.folder_id = p_folder_id AND fa.user_id = auth.uid()
      )
    );
END;
$function$`,
  add_node_to_folder: `CREATE OR REPLACE FUNCTION public.add_node_to_folder(p_node_id uuid, p_folder_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO folder_edges (node_id, folder_id)
  SELECT p_node_id, p_folder_id
  WHERE auth.uid() IS NULL OR folder_is_accessible(p_folder_id, auth.uid())
  ON CONFLICT DO NOTHING;
END;
$function$`,
  remove_node_from_folder: `CREATE OR REPLACE FUNCTION public.remove_node_from_folder(p_node_id uuid, p_folder_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM folder_edges
  WHERE node_id = p_node_id
    AND folder_id = p_folder_id
    AND (auth.uid() IS NULL OR folder_is_accessible(p_folder_id, auth.uid()));
END;
$function$`,
};

async function main() {
  const { default: pg } = await import("pg");
  let connStr = process.env.DATABASE_URL;
  const pw = connStr.match(/:([^:@]+)@/)?.[1];
  if (connStr.includes("db.lzkzfqshnjvlzosnntfx.supabase.co")) {
    connStr = `postgresql://postgres.lzkzfqshnjvlzosnntfx:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
  }
  const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });

  const { rows: check } = await pool.query(
    "SELECT to_regclass('public.nodes') AS n;"
  );
  if (!check[0]?.n) {
    console.error("ABORT: not the LIKED DB");
    process.exit(3);
  }

  const names = Object.keys(GATE_ON);
  const { rows } = await pool.query(
    `SELECT p.proname, pg_get_functiondef(p.oid) AS def, p.prolang::regproc AS lang
     FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public' AND p.proname = ANY($1)
     ORDER BY p.proname;`,
    [names]
  );
  await pool.end();

  const defs = {};
  for (const r of rows) {
    (defs[r.proname] ??= []).push(r);
  }

  // Verify all expected functions found
  const missing = names.filter((n) => !defs[n] || defs[n].length === 0);
  if (missing.length) {
    console.error("MISSING functions on remote:", missing.join(", "));
    process.exit(1);
  }
  // List overload counts
  for (const n of names) {
    if (defs[n].length > 1) console.log(`NOTE: ${n} has ${defs[n].length} overloads`);
  }

  const parts = [];
  parts.push(`-- ============================================================
-- Migration 092 — AUDIT-08 P0: Fix RPC authorization (IDOR)
-- ============================================================
-- 42 SECURITY DEFINER functions accepted caller-supplied user IDs
-- without validating against auth.uid() → any authenticated user could
-- read any user's data or impersonate any user for writes.
--
-- Fix: add an auth.uid() gate at the top of each function body.
--   - authenticated callers must pass their OWN user id (else P0003)
--   - service_role calls (auth.uid() = NULL) pass through unchanged
--
-- Resource-only functions (set_node_deleted, delete_folder,
-- add/remove_node_from_folder) now derive ownership/access from
-- auth.uid() with service-role bypass.
-- ============================================================
`);

  const processed = new Set();
  for (const n of names) {
    for (const r of defs[n]) {
      let def = r.def;
      const param = GATE_ON[n];
      const lang = String(r.lang);
      const isSql = /LANGUAGE sql/i.test(def);

      if (isSql) {
        // Convert to plpgsql and wrap with gate. The body is the SQL statement.
        const bodyStart = def.indexOf("AS $function$");
        if (bodyStart === -1) throw new Error(`cannot parse sql body for ${n}`);
        const body = def.slice(bodyStart + "AS $function$".length);
        // Strip the trailing closing dollar-quote tag (e.g. " $function$").
        const cleanBody = body.replace(/\s*\$\w+\$\s*$/, "");
        const prefix = def.slice(0, bodyStart);
        const prefixPlpgsql = prefix.replace(/\n LANGUAGE sql/, "\n LANGUAGE plpgsql");
        // Scalar-returning functions (RETURNS boolean etc.) must use
        // `RETURN (<expr>)`; SETOF/TABLE functions use `RETURN QUERY`.
        const returnsClause = def.match(/RETURNS ([^(]*?)(\n|$)/)?.[1] ?? "";
        const isScalar = !/TABLE|SETOF/i.test(returnsClause);
        const returnStmt = isScalar
          ? `  RETURN (${cleanBody.replace(/;\s*$/, "")});`
          : `  RETURN QUERY${cleanBody.replace(/;\s*$/, "")};`;
        def = `${prefixPlpgsql}AS $function$\nBEGIN\n${GATE_SQL(param)}\n${returnStmt}\nEND;\n$function$`;
      } else {
        // plpgsql: inject after the first BEGIN following AS $function$
        const marker = "AS $function$";
        const mIdx = def.indexOf(marker);
        if (mIdx === -1) throw new Error(`cannot parse body for ${n}`);
        const bIdx = def.indexOf("BEGIN", mIdx);
        if (bIdx === -1) throw new Error(`no BEGIN for ${n}`);
        const nl = def.indexOf("\n", bIdx);
        def = def.slice(0, nl + 1) + GATE_SQL(param) + "\n" + def.slice(nl + 1);
      }
      parts.push(def.replace(/;\s*$/, "") + ";\n");
      processed.add(n);
    }
  }

  // Resource-only functions
  for (const [name, sql] of Object.entries(RESOURCE_FIXES)) {
    parts.push("-- " + name + " (resource-only: ownership from auth.uid())\n" + sql.trimEnd() + ";\n");
  }

  const header = parts[0];
  const bodyParts = parts.slice(1);
  const out = header + "\n" + bodyParts.join("\n");

  const outPath = join(root, "supabase", "migrations", "092_fix_rpc_authz.sql");
  writeFileSync(outPath, out, "utf8");
  console.log(`✓ Wrote ${outPath}`);
  console.log(`  Functions: ${processed.size} gated + ${Object.keys(RESOURCE_FIXES).length} resource-only fixed`);
  console.log(`  Total SQL length: ${out.length} chars`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});

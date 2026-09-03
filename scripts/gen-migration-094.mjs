// Generate supabase/migrations/094_fix_anon_bypass_and_revoke.sql.
//
// AUDIT-08 follow-up (P0): migration 092's gate used
//   IF auth.uid() IS NOT NULL AND <param> IS DISTINCT FROM auth.uid() THEN RAISE
// which was meant to let service_role through (auth.uid() = NULL). BUT the
// anon role ALSO has auth.uid() = NULL, and every function still had anon +
// PUBLIC EXECUTE grants → an unauthenticated caller (bare anon key) could
// bypass the gate and read/impersonate ANY user.
//
// Fix:
//  1. Gate becomes role-aware:
//       IF NOT (auth.role() = 'service_role'
//               OR (auth.role() = 'authenticated'
//                   AND <param> IS NOT DISTINCT FROM auth.uid())) THEN
//         RAISE EXCEPTION 'Caller does not match user_id' USING ERRCODE = 'P0003';
//       END IF;
//     - service_role passes, authenticated must match own uid, anon ALWAYS blocked.
//  2. Resource-only functions switch their bypass from `auth.uid() IS NULL`
//     (anon-exploitable) to `auth.role() = 'service_role'`.
//  3. Least privilege: REVOKE EXECUTE FROM PUBLIC, anon (and authenticated
//     for service-only functions). The app's callers use either the
//     service_role client or the authenticated role — anon never needs these.
//
// Usage: node scripts/gen-migration-094.mjs  (writes the file, does NOT apply)

import { config } from "dotenv";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env.local") });

const LIKED_REF = "lzkzfqshnjvlzosnntfx";
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(LIKED_REF)) {
  console.error("ABORT: .env.local not pointing at LIKED project");
  process.exit(3);
}

// 37 functions that received the 092 gate (must have the gate text to replace).
const GATED = [
  "get_feed","get_social_timeline","get_user_folders","get_folder_tree",
  "get_visible_node_by_id","get_visible_nodes","get_friend_bar",
  "get_node_friend_ratings","get_visible_tags","get_nodes_in_folder",
  "is_folder_admin","is_group_admin","folder_is_accessible","folder_is_owned",
  "group_is_member","group_is_owned","get_node_permission","get_folder_permission",
  "has_node_permission","has_folder_permission","hard_delete_node",
  "move_node_to_folder","create_folder_with_nodes","get_or_create_unsorted_folder",
  "get_or_create_named_folder","update_display_name","update_avatar_key",
  "update_node_title","create_node_with_metadata","import_url","create_group",
  "direct_share","group_share","share_folder","group_unshare",
  "change_node_permission","change_folder_permission",
];

// Resource-only functions (no user-id param) — rewritten with role-aware bypass.
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
    AND (auth.role() = 'service_role' OR owner_id = auth.uid());
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
      auth.role() = 'service_role'
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
  WHERE auth.role() = 'service_role' OR folder_is_accessible(p_folder_id, auth.uid())
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
    AND (auth.role() = 'service_role' OR folder_is_accessible(p_folder_id, auth.uid()));
END;
$function$`,
};

// Service-only functions: revoke from PUBLIC, anon AND authenticated.
const SERVICE_ONLY = [
  "create_node_with_metadata","import_url","hard_delete_node","direct_share",
  "group_share","share_folder","group_unshare","create_group","delete_folder",
  "add_node_to_folder","remove_node_from_folder","move_folder","set_custom_order",
  "create_tag_with_translation","unshare_folder_op","upsert_rating",
  "update_node_title","update_display_name","update_avatar_key",
  "change_node_permission","change_folder_permission","has_node_permission",
  "has_folder_permission","get_node_permission","get_folder_permission",
  "get_nodes_in_folder",
];

// Authenticated-needed functions: revoke from PUBLIC + anon only.
const AUTH_NEEDED = [
  "get_feed","get_social_timeline","get_friend_bar","get_user_folders",
  "get_folder_tree","get_visible_node_by_id","get_visible_nodes",
  "get_visible_tags","get_node_friend_ratings","is_folder_admin","is_group_admin",
  "folder_is_accessible","folder_is_owned","group_is_member","group_is_owned",
  "rename_folder","get_or_create_unsorted_folder","get_or_create_named_folder",
  "move_node_to_folder","create_folder_with_nodes","set_node_deleted",
  "create_folder","upsert_card_position","liked_tag_palette",
];

async function main() {
  const { default: pg } = await import("pg");
  let connStr = process.env.DATABASE_URL;
  const pw = connStr.match(/:([^:@]+)@/)?.[1];
  if (connStr.includes("db.lzkzfqshnjvlzosnntfx.supabase.co")) {
    connStr = `postgresql://postgres.lzkzfqshnjvlzosnntfx:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
  }
  const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });

  const { rows } = await pool.query(
    `SELECT p.proname, pg_get_functiondef(p.oid) AS def
     FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public' AND p.proname = ANY($1) AND p.prokind = 'f'
     ORDER BY p.proname, p.oid;`,
    [GATED]
  );
  const { rows: sigs } = await pool.query(
    `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
     FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public' AND p.proname = ANY($1) AND p.prokind = 'f'
     ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);`,
    [[...SERVICE_ONLY, ...AUTH_NEEDED]]
  );
  await pool.end();

  const defs = {};
  for (const r of rows) (defs[r.proname] ??= []).push(r.def);
  const missing = GATED.filter((n) => !defs[n]?.length);
  if (missing.length) { console.error("MISSING defs:", missing.join(", ")); process.exit(1); }

  const parts = [`-- ============================================================
-- Migration 094 — Fix anon bypass + least-privilege EXECUTE revokes
-- ============================================================
-- 1. Role-aware auth gates (blocks anon; service_role passes):
--      IF NOT (auth.role() = 'service_role'
--              OR (auth.role() = 'authenticated'
--                  AND <param> IS NOT DISTINCT FROM auth.uid())) THEN RAISE
-- 2. Resource-only functions use auth.role() = 'service_role' bypass.
-- 3. REVOKE EXECUTE FROM PUBLIC, anon (and authenticated for service-only).
-- ============================================================
`];

  const OLD_GATE = /IF auth\.uid\(\) IS NOT NULL AND (\w+) IS DISTINCT FROM auth\.uid\(\) THEN/g;
  const NEW_GATE = "IF NOT (auth.role() = 'service_role' OR (auth.role() = 'authenticated' AND $1 IS NOT DISTINCT FROM auth.uid())) THEN";

  for (const n of GATED) {
    for (const def of defs[n]) {
      if (!OLD_GATE.test(def)) {
        // reset lastIndex after test
        OLD_GATE.lastIndex = 0;
        // check again properly
        if (!/IF auth\.uid\(\) IS NOT NULL AND \w+ IS DISTINCT FROM auth\.uid\(\) THEN/.test(def)) {
          console.error(`MISSING 092 gate in ${n} — aborting (def may have changed)`);
          process.exit(1);
        }
        OLD_GATE.lastIndex = 0;
      }
      OLD_GATE.lastIndex = 0;
      const fixed = def.replace(OLD_GATE, NEW_GATE);
      parts.push(fixed.replace(/;\s*$/, "") + ";\n");
    }
  }

  // Resource-only functions
  for (const [name, sql] of Object.entries(RESOURCE_FIXES)) {
    parts.push("-- " + name + " (resource-only: role-aware ownership)\n" + sql.trimEnd() + ";\n");
  }

  // Revokes
  const byName = {};
  for (const r of sigs) (byName[r.proname] ??= []).push(r.args);
  for (const [bucket, names] of [["service-only", SERVICE_ONLY], ["authenticated-needed", AUTH_NEEDED]]) {
    const grantees = bucket === "service-only" ? "PUBLIC, anon, authenticated" : "PUBLIC, anon";
    parts.push(`-- ── ${bucket}: REVOKE EXECUTE FROM ${grantees} ──`);
    for (const n of names) {
      const argsList = byName[n];
      if (!argsList?.length) { console.error(`MISSING signature for ${n}`); process.exit(1); }
      for (const a of argsList) parts.push(`REVOKE EXECUTE ON FUNCTION public.${n}(${a}) FROM ${grantees};`);
    }
    parts.push("");
  }

  const out = parts.join("\n");
  const outPath = join(root, "supabase", "migrations", "094_fix_anon_bypass_and_revoke.sql");
  writeFileSync(outPath, out, "utf8");
  console.log(`✓ Wrote ${outPath}`);
  console.log(`  ${GATED.length} gates fixed, ${Object.keys(RESOURCE_FIXES).length} resource-only fixed, ${sigs.length} revokes`);
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });

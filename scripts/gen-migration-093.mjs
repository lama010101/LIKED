// Generate supabase/migrations/093_revoke_authenticated_service_rpcs.sql.
//
// AUDIT-08 defense-in-depth: revoke EXECUTE TO authenticated on RPCs the
// app only ever calls with the SERVICE-ROLE client. The auth.uid() gates
// (migration 092) already close the IDOR; this further reduces the
// authenticated attack surface (least privilege).
//
// SAFETY: only functions verified below have NO caller using a user-session
// (authenticated-role) client. Functions called via lib/db/rpc.ts helper or
// browser clients are excluded.
//
// Usage: node scripts/gen-migration-093.mjs  (writes the file, does NOT apply)

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

// Functions to revoke from authenticated. Each has been verified to be
// called ONLY via getSupabaseServiceClient() in lib/db/*.ts (or only from
// within other SECURITY DEFINER functions that run as the owner).
const REVOKE = [
  "create_node_with_metadata",
  "import_url",
  "hard_delete_node",
  "direct_share",
  "group_share",
  "share_folder",
  "group_unshare",
  "create_group",
  "delete_folder",
  "add_node_to_folder",
  "remove_node_from_folder",
  "move_folder",
  "set_custom_order",
  "create_tag_with_translation",
  "unshare_folder_op",
  "upsert_rating",
  "update_node_title",
  "update_display_name",
  "update_avatar_key",
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
    `SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
     FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
     WHERE n.nspname = 'public' AND p.proname = ANY($1) AND p.prokind = 'f'
     ORDER BY p.proname, pg_get_function_identity_arguments(p.oid);`,
    [REVOKE]
  );
  await pool.end();

  const byName = {};
  for (const r of rows) (byName[r.proname] ??= []).push(r);
  const missing = REVOKE.filter((n) => !byName[n]?.length);
  if (missing.length) {
    console.error("MISSING on remote:", missing.join(", "));
    process.exit(1);
  }
  for (const n of REVOKE) {
    if (byName[n].length > 1) console.log(`NOTE: ${n} has ${byName[n].length} overloads — revoking all`);
  }

  const parts = [`-- ============================================================
-- Migration 093 — AUDIT-08 defense-in-depth: revoke authenticated EXECUTE
-- ============================================================
-- The app only calls these functions with the SERVICE-ROLE client
-- (lib/db/*.ts → getSupabaseServiceClient) or from within other SECURITY
-- DEFINER functions that run as the function owner. The authenticated role
-- never needs direct EXECUTE. Revoking it shrinks the attack surface
-- (least privilege) on top of the auth.uid() gates from migration 092.
-- ============================================================
`];
  for (const n of REVOKE) {
    for (const r of byName[n]) {
      parts.push(`REVOKE EXECUTE ON FUNCTION public.${r.proname}(${r.args}) FROM authenticated;`);
    }
  }

  const out = parts.join("\n");
  const outPath = join(root, "supabase", "migrations", "093_revoke_authenticated_service_rpcs.sql");
  writeFileSync(outPath, out, "utf8");
  console.log(`✓ Wrote ${outPath}`);
  console.log(`  ${REVOKE.length} functions revoked from authenticated (${rows.length} overloads total)`);
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});

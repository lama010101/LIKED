// Tier-0 invariant sweep — EXEC-READY-001 / R12.
// Machine-checked architectural invariants for LIKED. Each check prints
// PASS/FAIL; any FAIL exits 1. Read-only against the DB.
//
// Invariants:
//   DB  1. edge-only visibility: no non-deleted node missing owner edge
//      2. no edges.cause_id NULL
//      3. no UNIQUE(node_id,user_id) on edges
//      4. soft delete preserves causes/edges (every trashed node keeps >=1 edge + >=1 cause)
//      5. get_feed single overload, 16 params
//      6. update_display_name/update_avatar_key single overload each (migration 102)
//      7. every numbered migration file recorded in schema_migrations
//     15. folder_edges exemption (N9/PRD §6.1): folder membership is an
//         auxiliary table — no cause_type='folder_membership' may ever
//         exist; membership stays out of the cause/edge system
//     16. folder_edges writes only via the two authz-gated single-statement
//         RPCs (add_node_to_folder / remove_node_from_folder): both must
//         exist, be SECURITY DEFINER, and carry an authz gate
//   REPO 8. get_feed RPC has exactly one call site (lib/db/feed.ts) — AUDIT-06 P1-1
//      9. no client-side feed reorder: feedStore gone, no useFeedStore refs — P2-1
//     10. no activeTag client filter in views — P1-3
//     11. RPC-only writes: no direct insert/update/delete/upsert on edges/causes/folder_edges/folder_tree
//     12. atomic writes: dnd.ts uses move_node_to_folder + create_folder_with_nodes
//     13. no committed secrets in tracked files
//     14. tsc --noEmit clean
//     20. /api/ask/* bodies only via readAskJsonBody — no request.json()/
//         req.json()/.formData()/.text() under app/api/ask/** (V2-W3-P0-08)
// Usage: node scripts/check-invariants-001.mjs
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, readdirSync, existsSync } from "fs";
import { execSync, execFileSync } from "child_process";
import { deriveV2Tables, probeV2TableSecurity } from "./check-invariants-001.db20.mjs";
import { findCoverageGaps } from "./lib/delete-account-coverage.mjs";
import {
  deriveV2Functions,
  loadV2FunctionCatalog,
  loadFunctionExecGrants,
  loadCoverageLiveFks,
  loadCoverageLiveColumns,
  loadCoverageLivePayloadKeys,
  evaluateV2FunctionSecurity,
  findV2DdlViolations,
  planV2RoleProbe,
  buildProbeCall,
  probeSql,
} from "./lib/v2-catalog-probes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env.local") });

const LIKED_REF = "lzkzfqshnjvlzosnntfx";
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(LIKED_REF)) {
  console.error("ABORT: NEXT_PUBLIC_SUPABASE_URL is not the LIKED project");
  process.exit(3);
}

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
};

// ---------- DB checks ----------
const { default: pg } = await import("pg");
let connStr = process.env.DATABASE_URL;
const pw = connStr.match(/:([^:@]+)@/)?.[1];
if (connStr.includes("db.lzkzfqshnjvlzosnntfx.supabase.co")) {
  connStr = `postgresql://postgres.lzkzfqshnjvlzosnntfx:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
}
const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
try {
  const { rows: guard } = await client.query("SELECT to_regclass('public.nodes') AS n;");
  if (guard[0]?.n !== "nodes") { console.error("ABORT: not LIKED DB"); process.exit(3); }

  const q1 = async (sql) => (await client.query(sql)).rows;

  const missingEdge = await q1(`SELECT COUNT(*)::int AS c FROM nodes n WHERE n.deleted_at IS NULL
    AND NOT EXISTS (SELECT 1 FROM edges e WHERE e.node_id=n.id AND e.user_id=n.owner_id)`);
  check("DB-1 edge-only visibility (owner edge on every live node)", missingEdge[0].c === 0, `${missingEdge[0].c} missing`);

  const nullCause = await q1(`SELECT COUNT(*)::int AS c FROM edges WHERE cause_id IS NULL`);
  check("DB-2 non-null cause_id", nullCause[0].c === 0, `${nullCause[0].c} NULL`);

  const uniq = await q1(`SELECT conname FROM pg_constraint WHERE conrelid='public.edges'::regclass AND contype='u'
    AND pg_get_constraintdef(oid) ILIKE '%node_id%user_id%'`);
  check("DB-3 no UNIQUE(node_id,user_id) on edges", uniq.length === 0, `${uniq.length} found`);

  const softDel = await q1(`SELECT
    (SELECT COUNT(*)::int FROM nodes WHERE deleted_at IS NOT NULL) AS dn,
    (SELECT COUNT(*)::int FROM nodes n WHERE n.deleted_at IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM edges e WHERE e.node_id=n.id)) AS no_edge,
    (SELECT COUNT(*)::int FROM nodes n WHERE n.deleted_at IS NOT NULL AND NOT EXISTS
      (SELECT 1 FROM edges e JOIN causes c ON c.id=e.cause_id WHERE e.node_id=n.id)) AS no_cause`);
  check("DB-4 soft delete preserves causes/edges", softDel[0].no_edge === 0 && softDel[0].no_cause === 0,
    `${softDel[0].dn} deleted, ${softDel[0].no_edge} missing edges, ${softDel[0].no_cause} missing causes`);

  const gf = await q1(`SELECT pronargs FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='get_feed'`);
  check("DB-5 get_feed single overload, 16 params", gf.length === 1 && gf[0].pronargs === 16,
    `${gf.length} overloads, ${gf[0]?.pronargs} params`);

  const upd = await q1(`SELECT proname, COUNT(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('update_display_name','update_avatar_key') GROUP BY proname`);
  check("DB-6 update_* single overload each (migration 102)",
    upd.length === 2 && upd.every((r) => r.n === 1), JSON.stringify(upd));

  const files = readdirSync(join(root, "supabase", "migrations"))
    .filter((f) => f.endsWith(".sql")).map((f) => f.match(/^(\d+)/)?.[1]).filter(Boolean);
  const rec = await q1(`SELECT version FROM supabase_migrations.schema_migrations`);
  const recSet = new Set(rec.map((r) => r.version));
  const unrec = files.filter((f) => !recSet.has(f));
  // Ledger practice began at migration 088 (recorded post-hoc by B8); files
  // 001-087 predate it and are out of scope. Everything >=088 must be recorded.
  const unrecPostLedger = unrec.filter((f) => Number(f) >= 88);
  check("DB-7 migrations >=088 recorded in schema_migrations", unrecPostLedger.length === 0,
    unrecPostLedger.length ? `unrecorded: ${unrecPostLedger.join(",")}` : `all >=088 recorded (pre-ledger gap: ${unrec.length} files 001-087)`);

  // DB-15 — N9 folder_edges exemption: folder membership is auxiliary,
  // never cause-bound. If a 'folder_membership' cause_type ever appears,
  // membership has leaked into the cause/edge system — a real violation.
  const fmCauses = await q1(`SELECT COUNT(*)::int AS c FROM causes WHERE cause_type = 'folder_membership'`);
  check("DB-15 folder_edges exemption (no folder_membership causes)", fmCauses[0].c === 0,
    `${fmCauses[0].c} folder_membership causes`);

  // DB-16 — N9: membership add/remove must stay inside the two dedicated
  // authz-gated single-statement RPCs (not open table writes).
  const folderRpcs = await q1(`SELECT proname, prosecdef,
      (pg_get_functiondef(p.oid) ILIKE '%auth.role()%service_role%') AS gated
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND proname IN ('add_node_to_folder','remove_node_from_folder')`);
  check("DB-16 folder_edges RPCs exist + authz-gated",
    folderRpcs.length === 2 && folderRpcs.every((r) => r.prosecdef && r.gated),
    JSON.stringify(folderRpcs));

  // DB-18 — MVP2 P0-03: permanent delete is cascade-only. Every FK that
  // references nodes or folders must be ON DELETE CASCADE.
  const nonCascade = await q1(`SELECT conrelid::regclass::text AS t, conname FROM pg_constraint
    WHERE contype='f' AND confrelid IN ('public.nodes'::regclass,'public.folders'::regclass)
      AND confdeltype <> 'c'`);
  check("DB-18 node/folder dependents are ON DELETE CASCADE", nonCascade.length === 0,
    nonCascade.length ? nonCascade.map((r) => `${r.t}.${r.conname}`).join(", ") : "all cascade");
} finally {
  client.release();
  await pool.end();
}

// DB-17 — COMPLETE-APP-002 (G-2/G-3): every RPC introduced by migrations
// 107-110 must exist, be SECURITY DEFINER with SET search_path, have no
// EXECUTE for PUBLIC/anon, and return 42501 on an unauthenticated call.
{
  const { default: pg2 } = await import("pg");
  let c2 = process.env.DATABASE_URL;
  const pw2 = c2.match(/:([^:@]+)@/)?.[1];
  if (c2.includes("db.lzkzfqshnjvlzosnntfx.supabase.co")) {
    c2 = `postgresql://postgres.lzkzfqshnjvlzosnntfx:${pw2}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
  }
  const pool2 = new pg2.Pool({ connectionString: c2, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
  const client2 = await pool2.connect();
  try {
    const NEW_RPCS = [
      { fn: "get_onboarding_state", args: {} },
      { fn: "set_onboarding_flag", args: { p_step: "imported" } },
      { fn: "get_onboarding_import_node_ids", args: {} },
      { fn: "delete_group", args: { p_group_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "create_folder_template", args: { p_template_key: "read_later", p_name: "x" } },
      // get_folder_memberships dropped in migration 132 (P12 cut-over)
      // MVP2 P0-04 (migration 112)
      { fn: "add_tag_to_node", args: { p_tag_id: "00000000-0000-0000-0000-000000000000", p_node_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "remove_tag_from_node", args: { p_tag_id: "00000000-0000-0000-0000-000000000000", p_node_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "add_tag_to_folder", args: { p_tag_id: "00000000-0000-0000-0000-000000000000", p_folder_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "remove_tag_from_folder", args: { p_tag_id: "00000000-0000-0000-0000-000000000000", p_folder_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "set_folder_color", args: { p_folder_id: "00000000-0000-0000-0000-000000000000", p_color: "#000000" } },
      { fn: "invite_friend", args: { p_email: "x@example.com" } },
      { fn: "remove_friend", args: { p_target_user_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "block_user", args: { p_blocked_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "set_language", args: { p_language_code: "en" } },
      { fn: "mark_notifications_read", args: { p_ids: null } },
      // MVP2 P2 (migrations 122-130): folder visibility + sharing engine
      { fn: "folder_is_visible", args: { p_folder_id: "00000000-0000-0000-0000-000000000000", p_user_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "effective_folder_permission", args: { p_folder_id: "00000000-0000-0000-0000-000000000000", p_user_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "effective_node_permission", args: { p_node_id: "00000000-0000-0000-0000-000000000000", p_user_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "create_folder", args: { p_name: "x" } },
      { fn: "move_folder", args: { p_folder_id: "00000000-0000-0000-0000-000000000000", p_new_parent_id: null } },
      { fn: "rename_folder", args: { p_folder_id: "00000000-0000-0000-0000-000000000000", p_name: "x" } },
      { fn: "set_folder_details", args: { p_folder_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "add_node_to_folder", args: { p_node_id: "00000000-0000-0000-0000-000000000000", p_folder_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "remove_node_from_folder", args: { p_node_id: "00000000-0000-0000-0000-000000000000", p_folder_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "share_folder_v2", args: { p_folder_id: "00000000-0000-0000-0000-000000000000", p_permission: "view" } },
      { fn: "revoke_folder_grant", args: { p_folder_id: "00000000-0000-0000-0000-000000000000", p_grantee_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "set_folder_grant_permission", args: { p_folder_id: "00000000-0000-0000-0000-000000000000", p_grantee_id: "00000000-0000-0000-0000-000000000000", p_permission: "view" } },
      { fn: "share_node", args: { p_node_id: "00000000-0000-0000-0000-000000000000", p_permission: "view" } },
      { fn: "trash_folder", args: { p_folder_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "restore_folder", args: { p_folder_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "hard_delete_folder", args: { p_folder_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "restore_node", args: { p_node_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "empty_trash", args: {} },
      { fn: "rate_folder", args: { p_folder_id: "00000000-0000-0000-0000-000000000000", p_score: 50 } },
      { fn: "get_or_create_system_folder", args: { p_kind: "youtube" } },
      { fn: "create_organize_batch", args: { p_source_folder_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "set_organize_item_proposal", args: { p_batch_id: "00000000-0000-0000-0000-000000000000", p_node_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "apply_organization_batch", args: { p_batch_id: "00000000-0000-0000-0000-000000000000", p_item_ids: [] } },
      { fn: "discard_organization_batch", args: { p_batch_id: "00000000-0000-0000-0000-000000000000" } },
      // m133 restored: still called by apply_organization_batch + _resolve_auto_folder
      { fn: "get_or_create_named_folder", args: { p_user_id: "00000000-0000-0000-0000-000000000000", p_name: "x" } },
      { fn: "set_youtube_import_consent", args: { p_consent: true } },
      { fn: "add_group_member", args: { p_group_id: "00000000-0000-0000-0000-000000000000", p_user_id: "00000000-0000-0000-0000-000000000000" } },
      { fn: "remove_group_member", args: { p_group_id: "00000000-0000-0000-0000-000000000000", p_user_id: "00000000-0000-0000-0000-000000000000" } },
      ...(globalThis.__MVP2_EXTRA_RPCS ?? []),
    ];
    const names = NEW_RPCS.map((r) => r.fn);
    const meta = await client2.query(
      `SELECT p.proname, p.prosecdef,
              (SELECT COUNT(*) FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=public%') > 0 AS has_sp
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = ANY($1)`, [names]);
    const metaMap = new Map(meta.rows.map((r) => [r.proname, r]));
    const priv = await client2.query(
      `SELECT routine_name, grantee FROM information_schema.routine_privileges
        WHERE routine_schema='public' AND routine_name = ANY($1) AND privilege_type='EXECUTE'
          AND grantee IN ('PUBLIC','anon')`, [names]);
    const leaked = new Set(priv.rows.map((r) => r.routine_name));

    const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    for (const { fn, args } of NEW_RPCS) {
      const m = metaMap.get(fn);
      let anonStatus = "n/a", anonOk = false;
      try {
        const res = await fetch(`${base}/rest/v1/rpc/${fn}`, {
          method: "POST",
          headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(args),
        });
        const body = await res.json().catch(() => ({}));
        anonStatus = `${res.status} ${body?.code ?? ""}`;
        anonOk = res.status === 401 && body?.code === "42501";
      } catch (e) { anonStatus = `fetch-fail ${e.message}`; }
      check(`DB-17 ${fn} exists + DEFINER + search_path + anon-blocked (42501)`,
        !!m && m.prosecdef === true && m.has_sp === true && !leaked.has(fn) && anonOk,
        `${m ? `definer=${m.prosecdef} sp=${m.has_sp}` : "MISSING"} anonCall=${anonStatus}${leaked.has(fn) ? " PUBLIC/anon EXECUTE" : ""}`);
    }
    // DB-19 — P12: superseded RPCs must be gone from the schema.
    const DROPPED = [
      "share_folder", "delete_folder", "get_folder_access_users",
      "get_folder_memberships", "get_social_timeline", "revoke_folder_admin",
      "unshare_folder_op", "revoke_group_admin", "direct_share",
      "group_share", "group_unshare", "get_or_create_unsorted_folder",
    ];
    const dropped = await client2.query(
      `SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname = ANY($1)`, [DROPPED]);
    check("DB-19 superseded RPCs dropped (P12)", dropped.rows.length === 0,
      dropped.rows.map((r) => r.proname).join(", ") || "all dropped");

    // DB-20 — V2-W2-P0-06A (PLAN-V2-002 §1.3, §8 P0-06): every table
    // created by migrations 142/143 must have RLS enabled, zero
    // pg_policies rows, and no anon/authenticated entries in
    // information_schema.role_table_grants.
    const v2Tables = deriveV2Tables(root);
    console.log(`DB-20 v2 tables derived from migrations 142/143 (${v2Tables.length}): ${v2Tables.join(", ")}`);
    const db20 = await probeV2TableSecurity(client2, v2Tables);
    check("DB-20 v2 tables: RLS on, zero policies, no anon/authenticated grants",
      db20.ok, db20.detail);
  } finally {
    client2.release();
    await pool2.end();
  }
}

// DB-21/22/23 — V2-W2-P0-06B (PLAN-V2-002 §8): v2 function catalog
// security, delete_account FK-coverage guard, and v2-function DDL
// safety. Catalog reads are read-only; the denied-call probes run
// inside BEGIN…ROLLBACK with the harness safety pattern copied from
// verify-delete-account.mjs (session guardrails, signal handlers,
// idle-in-transaction pre-flight). PROBE RULE: a function is only
// called when has_function_privilege says EXECUTE is absent (expected
// SQLSTATE 42501), one SAVEPOINT per call.
{
  const { default: pg3 } = await import("pg");
  let c3 = process.env.DATABASE_URL;
  const pw3 = c3.match(/:([^:@]+)@/)?.[1];
  if (c3.includes(`db.${LIKED_REF}.supabase.co`)) {
    c3 = `postgresql://postgres.${LIKED_REF}:${pw3}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
  }
  const pool3 = new pg3.Pool({ connectionString: c3, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
  const client3 = await pool3.connect();
  const shutdown3 = (why) => {
    console.log(`\n${why} — issuing ROLLBACK and closing connection`);
    setTimeout(() => process.exit(130), 8000).unref();
    (async () => {
      try { await client3.query("ROLLBACK"); } catch { /* connection may be dead */ }
      try { client3.release(); } catch { /* already released */ }
      try { await pool3.end(); } catch { /* ignore */ }
      process.exit(130);
    })();
  };
  const onSigint3 = () => shutdown3("SIGINT received");
  const onSigterm3 = () => shutdown3("SIGTERM received");
  const onUncaught3 = (e) => shutdown3(`UNCAUGHT EXCEPTION: ${e.message}`);
  const onUnhandled3 = (e) => shutdown3(`UNHANDLED REJECTION: ${e?.message ?? e}`);
  process.on("SIGINT", onSigint3);
  process.on("SIGTERM", onSigterm3);
  process.on("uncaughtException", onUncaught3);
  process.on("unhandledRejection", onUnhandled3);
  const unhook3 = () => {
    process.off("SIGINT", onSigint3);
    process.off("SIGTERM", onSigterm3);
    process.off("uncaughtException", onUncaught3);
    process.off("unhandledRejection", onUnhandled3);
  };
  try {
    // Session guardrails + pre-flight, same as verify-delete-account.mjs.
    await client3.query(
      "SET idle_in_transaction_session_timeout = '60s'; " +
      "SET lock_timeout = '10s'; " +
      "SET statement_timeout = '120s'; " +
      "SET application_name = 'liked-harness-check-invariants-v2';"
    );
    const { rows: zombies } = await client3.query(
      `SELECT pid, application_name, state, now() - xact_start AS xact_age
         FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
          AND application_name LIKE 'liked-harness-%'
          AND state = 'idle in transaction'`
    );
    if (zombies.length > 0) {
      console.error(`ABORT: ${zombies.length} other 'liked-harness-*' session(s) idle in transaction — DB-21/22/23 not run:`);
      for (const z of zombies) {
        console.error(`  pid=${z.pid} application_name=${z.application_name} state=${z.state} xact_age=${z.xact_age}`);
      }
      client3.release();
      await pool3.end();
      unhook3();
      process.exit(2);
    }
    await client3.query("BEGIN");
    try {
      // ---- DB-21: v2 function catalog security + anon probe ----
      const derived = deriveV2Functions(root);
      const clsOf = new Map(derived.map((f) => [f.name, f.cls]));
      const sNames = derived.filter((f) => f.cls === "S").map((f) => f.name);
      const oNames = derived.filter((f) => f.cls === "O").map((f) => f.name);
      console.log(`DB-21 v2 functions derived from migrations 142-146 (${derived.length}): S(${sNames.length})=[${sNames.join(", ")}] O(${oNames.length})=[${oNames.join(", ")}]`);
      const cat = await loadV2FunctionCatalog(client3, derived.map((f) => f.name));
      const rows = cat.map((r) => ({ ...r, cls: clsOf.get(r.name) ?? "S" }));
      const ev = evaluateV2FunctionSecurity(derived, rows);
      const execAnon = await loadFunctionExecGrants(client3, cat.map((r) => r.oid), ["anon"]);
      const probeBad = [];
      let probeCalls = 0;
      for (const r of rows) {
        const plan = planV2RoleProbe(r.cls, "anon", execAnon.get(`anon|${r.oid}`) === true);
        if (plan.action === "call-deny") {
          probeCalls++;
          const res = await probeSql(client3, buildProbeCall(r.name, r.argtypes));
          if (!(res.threw && res.code === "42501")) {
            probeBad.push(`${r.name}: expected 42501, got ${res.threw ? res.code : "success"} ${res.message}`.trim());
          }
        } else if (plan.action === "fail-privilege") {
          probeBad.push(`${r.name}: ${plan.reason}`);
        }
      }
      check("DB-21 v2 functions: DEFINER+search_path, no PUBLIC/anon EXECUTE, S no authenticated, O has authenticated, single overload, anon->42501",
        ev.ok && probeBad.length === 0,
        [...ev.violations, ...probeBad].join("; ")
          || `${derived.length} functions clean (${probeCalls} anon call probes -> 42501)`);

      // ---- DB-22: delete_account FK/payload coverage guard ----
      const liveFks = await loadCoverageLiveFks(client3);
      const liveColumns = await loadCoverageLiveColumns(client3);
      const livePayloadKeys = await loadCoverageLivePayloadKeys(client3);
      const gaps = findCoverageGaps({ liveFks, liveColumns, livePayloadKeys });
      check("DB-22 delete_account coverage guard (FKs + unreferenced cols + payload keys)",
        gaps.length === 0,
        gaps.length ? gaps.join("; ")
          : `live: ${liveFks.length} FKs, ${liveColumns.length} unreferenced cols, ${livePayloadKeys.length} payload keys — no gaps`);

      // ---- DB-23: no protected-table DML inside v2 functions ----
      const defs = [];
      for (const r of cat) {
        const { rows: d } = await client3.query(`SELECT pg_get_functiondef($1::oid) AS d`, [r.oid]);
        defs.push({ name: r.name, def: d[0]?.d ?? "" });
      }
      const ddl = findV2DdlViolations(defs);
      check("DB-23 no edges/folder_edges DML in v2 fns; causes DML only as delete_account DELETE",
        ddl.ok,
        ddl.ok
          ? `${defs.length} functiondefs clean${ddl.allowedCalls.length ? `; allowed calls: ${ddl.allowedCalls.join("; ")}` : ""}`
          : ddl.violations.join("; "));
    } finally {
      try { await client3.query("ROLLBACK"); } catch { /* already rolled back */ }
    }
  } finally {
    unhook3();
    client3.release();
    await pool3.end();
  }
}

// ---------- Repo checks ----------
const SRC_DIRS = ["app", "lib", "components"];
import { isAbsolute } from "path";
const collect = (dir, out = []) => {
  const abs = isAbsolute(dir) ? dir : join(root, dir);
  if (!existsSync(abs)) return out;
  for (const e of readdirSync(abs, { withFileTypes: true })) {
    const p = join(abs, e.name);
    if (e.isDirectory() && !["node_modules", ".next"].includes(e.name)) collect(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) out.push(p);
  }
  return out;
};
const srcFiles = SRC_DIRS.flatMap((d) => collect(d));

// 8. get_feed single call site
const feedCallSites = srcFiles.filter((f) => /rpc\(\s*["']get_feed["']/.test(readFileSync(f, "utf8")));
check("REPO-8 get_feed has exactly one RPC call site",
  feedCallSites.length === 1 && /lib[\\/]db[\\/]feed\.ts$/.test(feedCallSites[0]),
  feedCallSites.map((f) => f.replace(root + "\\", "")).join(", ") || "none");

// 9. no client-side feed reorder (feedStore gone)
const storeRefs = srcFiles.filter((f) => !f.includes("lib\\store\\") && !f.includes("lib/store/") && /useFeedStore|feedStore/.test(readFileSync(f, "utf8")));
check("REPO-9 no client-side feed reorder (feedStore refs)", !existsSync(join(root, "lib/store/feedStore.ts")) && storeRefs.length === 0,
  storeRefs.map((f) => f.replace(root + "\\", "")).join(", ") || "clean");

// 10. no activeTag client filter (code usage — comments documenting the
// removal are allowed; match prop declarations and comparisons only)
const tagFilter = srcFiles.filter((f) => {
  const c = readFileSync(f, "utf8");
  return /activeTag\s*[?:]|===\s*activeTag|!==\s*activeTag|activeTag\s*===|activeTag\s*!==/.test(c);
});
check("REPO-10 no activeTag client filter", tagFilter.length === 0,
  tagFilter.map((f) => f.replace(root + "\\", "")).join(", ") || "clean");

// 11. RPC-only writes to edges/causes/folder_edges/folder_tree
const writeRe = /\.from\(\s*["'](edges|causes|folder_edges|folder_tree)["']\s*\)\s*\.(insert|update|delete|upsert)/;
const directWrites = srcFiles.filter((f) => writeRe.test(readFileSync(f, "utf8")));
check("REPO-11 RPC-only writes (edges/causes/folder_edges/folder_tree)", directWrites.length === 0,
  directWrites.map((f) => f.replace(root + "\\", "")).join(", ") || "clean");

// 15. MVP2 P0-04 (F7): no direct writes to domain tables from app code —
// every write goes through an RPC. (youtube_connections own-row token
// storage is the single sanctioned exception.) categorization_suggestions
// is dropped by P2-08 (F6), at which point its writers disappear.
const domainWriteRe = /\.from\(\s*["'](tag_edges|folders|nodes|blocks|friend_invites|users|notifications|groups|group_members|ratings|folder_grants|folder_ratings|organize_batches|organize_items|user_prefs|contributors|asks|items|item_availability|item_availability_fetch|tmdb_genres|submissions|recommendations|owner_item_state|owner_contributor_blocks|owner_picks|enrichment_jobs|email_outbox|rate_limits|youtube_search_cache|youtube_search_budget|account_deletion_jobs|deletion_requests|node_items)["']\s*\)\s*\.(insert|update|delete|upsert)\(/;
const domainWrites = srcFiles.filter((f) => domainWriteRe.test(readFileSync(f, "utf8")));
check("REPO-15 RPC-only writes (all domain tables)", domainWrites.length === 0,
  domainWrites.map((f) => f.replace(root + "\\", "")).join(", ") || "clean");

// 12. atomic multi-row writes via single RPCs (MVP2: folder moves via
// move_node_to_folder; batch ops via create_folder_with_nodes / organize RPCs)
const mvp2 = readFileSync(join(root, "app/lib/actions/mvp2.ts"), "utf8");
check("REPO-12 atomic writes (move_node_to_folder + create_folder_with_nodes)",
  mvp2.includes("move_node_to_folder")
  && /create_folder_with_nodes|apply_organization_batch/.test(
       readFileSync(join(root, "app/api/categorize/route.ts"), "utf8")
       + mvp2));

// 13. no committed secrets in tracked files
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
const SECRET_RE = /sb_secret_[A-Za-z0-9_-]{10,}|sk_live_[A-Za-z0-9]{10,}|sk_test_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}|sbp_[A-Za-z0-9]{20,}|sk-or-v1-[A-Za-z0-9]{20,}|GOCSPX-[A-Za-z0-9_-]{10,}|postgres(ql)?:\/\/[^:@/ ]+:[A-Za-z0-9._~%!*-]{8,}@/;
const leaks = [];
for (const f of tracked) {
  try {
    const c = readFileSync(join(root, f), "utf8");
    if (SECRET_RE.test(c)) leaks.push(f);
  } catch { /* binary */ }
}
check("REPO-13 no committed secrets in tracked files", leaks.length === 0,
  leaks.join(", ") || `${tracked.length} files scanned`);

// 14. tsc --noEmit clean
let tscOk = false;
try {
  execSync("npx tsc --noEmit", { cwd: root, stdio: "pipe" });
  tscOk = true;
} catch { tscOk = false; }
check("REPO-14 tsc --noEmit clean", tscOk);

// 17. V2-W1B-P0-10 (PLAN-V2-002 §7.3/§7.2): no hex colour literal and no
// hard-coded user-visible string in the NEW v2 directories. Missing dirs
// are skipped (they appear in later waves). Hex literals are allowed only
// in app/v2-tokens.css and lib/theme/* — neither lives inside the scanned
// dirs, so any match here is a violation.
const V2_DIRS = [
  "app/inbox", "app/r", "app/s", "app/settings", "app/delete-account",
  "components/v2",
];
const HEX_RE = /#[0-9A-Fa-f]{3,8}\b/;
const JSX_TEXT_RE = />\s*[A-Za-z][A-Za-z0-9 ,.'!?:;()&%+-]{2,}\s*</;
const v2Files = V2_DIRS.flatMap((d) => collect(d));
const hexHits = [];
const stringHits = [];
for (const f of v2Files) {
  const rel = f.replace(root + "\\", "").replace(root + "/", "");
  const c = readFileSync(f, "utf8");
  if (/\.(css|tsx?|jsx?|mjs)$/.test(f) && HEX_RE.test(c)) hexHits.push(rel);
  if (/\.tsx$/.test(f) && JSX_TEXT_RE.test(c)) stringHits.push(rel);
}
check("REPO-17 no hex literals / hard-coded strings in v2 dirs",
  hexHits.length === 0 && stringHits.length === 0,
  [...hexHits.map((f) => "hex:" + f), ...stringHits.map((f) => "str:" + f)].join(", ")
    || `${v2Files.length} v2 files scanned; dirs=[${V2_DIRS.join(", ")}] (${V2_DIRS.filter((d) => existsSync(join(root, d))).length} present)`);

// 19. P0-09 (PLAN-V2-002 §6.3/D17): no IP/geo header read for language —
// language comes from cookie + Accept-Language only. Header names per
// the task spec: x-forwarded-for, x-real-ip, x-vercel-ip-*, cf-ipcountry,
// geolocation and similar client-IP/geo signals.
const i18nFiles = [
  ...collect("i18n"),
  ...collect("lib/i18n"),
].filter((f) => /\.(ts|tsx|mjs|js)$/.test(f));
const ipHits = i18nFiles.filter((f) =>
  /x-forwarded-for|x-real-ip|x-vercel-ip|cf-ipcountry|cf-connecting-ip|x-client-ip|true-client-ip|geolocation|\brequest\.ip\b|\breq\.ip\b|clientIp/i.test(readFileSync(f, "utf8")));
check("REPO-19 no IP/geo header read in i18n", ipHits.length === 0,
  ipHits.map((f) => f.replace(root + "\\", "")).join(", ") || `${i18nFiles.length} i18n files scanned`);

// 18. P0-07 (PLAN-V2-002 §5.2 / REPO-18): youtube.readonly may appear only in
// lib/youtube/* and app/api/youtube/connect/route.ts; the unified-grant
// persist helper must have zero importers.
const relOf = (f) =>
  f.replace(root + "\\", "").replace(root + "/", "").replace(/\\/g, "/");
const ytScopeHits = srcFiles.filter((f) => {
  const rel = relOf(f);
  return /youtube\.readonly/.test(readFileSync(f, "utf8"))
    && !rel.startsWith("lib/youtube/")
    && rel !== "app/api/youtube/connect/route.ts";
});
const persistHits = srcFiles.filter((f) =>
  /persistYouTubeConnectionFromSession/.test(readFileSync(f, "utf8"))
  && !relOf(f).startsWith("lib/youtube/persist-connection"));
check("REPO-18 youtube.readonly scope + persist helper guard",
  ytScopeHits.length === 0 && persistHits.length === 0,
  [...ytScopeHits, ...persistHits].map((f) => f.replace(root + "\\", "")).join(", ") || "clean");

// 16. V2-W2-P0-06A (PLAN-V2-002 §8 REPO-16): guest/class-S RPC names may be
// called only through getSupabaseServiceClient(); no guest/class-S RPC name
// may appear in a client component under the ask dirs. Missing dirs are
// skipped (they ship in later waves) — vacuous PASS, same as REPO-17.
const ASK_DIRS = ["app/api/ask", "lib/ask"];
const GUEST_CLASS_S_RPCS = [
  // guest session + submit/receipt (plan §2.2-§2.4, P0-03 migration 144)
  "guest_get_ask", "guest_create_contributor", "guest_rename", "guest_touch",
  "guest_verify", "guest_get_or_create_account_contributor",
  "submit_recommendations", "guest_get_receipt",
  // public picks + claim (plan §2.8/§2.9, P1)
  "get_public_picks", "guest_get_picks", "claim_guest",
  // account/guest deletion (plan §2.10)
  "delete_guest_data", "delete_account",
  // infra/worker class S (migration 143 + P0-03 upsert_item)
  "rl_hit", "yt_budget_consume", "enrichment_claim", "enrichment_finish",
  "item_apply_details", "item_apply_availability", "item_refresh_apply",
  "housekeeping_purge", "upsert_item",
];
const guestRpcCallRe = new RegExp(
  `\\.rpc\\(\\s*["'\`](${GUEST_CLASS_S_RPCS.join("|")})["'\`]`);
const guestNameRe = new RegExp(`\\b(${GUEST_CLASS_S_RPCS.join("|")})\\b`);
const askFiles = ASK_DIRS.flatMap((d) => collect(d));
const askSvcHits = [];
const askClientHits = [];
for (const f of askFiles) {
  const c = readFileSync(f, "utf8");
  const rel = relOf(f);
  if (/"use client"|'use client'/.test(c) && guestNameRe.test(c)) askClientHits.push(rel);
  if (guestRpcCallRe.test(c) && !c.includes("getSupabaseServiceClient")) askSvcHits.push(rel);
}
const askDirsPresent = ASK_DIRS.filter((d) => existsSync(join(root, d))).length;
check("REPO-16 guest/class-S RPCs via service client only; none in client components",
  askSvcHits.length === 0 && askClientHits.length === 0,
  askDirsPresent === 0
    ? `dirs absent (${ASK_DIRS.join(", ")}) — vacuous pass`
    : [...askSvcHits.map((f) => "svc:" + f), ...askClientHits.map((f) => "client:" + f)].join(", ")
      || `${askFiles.length} ask files scanned (${askDirsPresent} dirs present)`);

// 20. V2-W3-P0-08 SEC-FIX (PLAN-V2-002 §4.2/T4): every /api/ask/* handler
// must read bodies through readAskJsonBody (lib/ask/guard.ts) so the 64 KB
// stream cap applies — request.json()/req.json()/.formData()/.text()
// bypass it. Vacuous PASS while app/api/ask is absent (same as REPO-16/17).
const ASK_API_BODY_RE = /\b(?:request|req)\s*\.\s*json\s*\(|\.\s*formData\s*\(|\.\s*text\s*\(/;
const askApiFiles = existsSync(join(root, "app", "api", "ask"))
  ? collect("app/api/ask")
  : [];
const askBodyHits = askApiFiles.filter((f) => ASK_API_BODY_RE.test(readFileSync(f, "utf8")));
check("REPO-20 /api/ask handlers: no direct request.json()/req.json()/.formData()/.text()",
  askBodyHits.length === 0,
  askApiFiles.length === 0
    ? "app/api/ask absent — vacuous pass"
    : askBodyHits.map((f) => relOf(f)).join(", ") || `${askApiFiles.length} ask api files scanned`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

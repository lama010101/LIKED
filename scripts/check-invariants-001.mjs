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
// Usage: node scripts/check-invariants-001.mjs
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync, readdirSync, existsSync } from "fs";
import { execSync, execFileSync } from "child_process";

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
      { fn: "get_folder_memberships", args: { p_folder_id: "00000000-0000-0000-0000-000000000000" } },
    ];
    const names = NEW_RPCS.map((r) => r.fn);
    const meta = await client2.query(
      `SELECT p.proname, p.prosecdef,
              (SELECT COUNT(*) FROM unnest(p.proconfig) c WHERE c = 'search_path=public') > 0 AS has_sp
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
  } finally {
    client2.release();
    await pool2.end();
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

// 12. atomic multi-row writes via single RPCs
const dnd = readFileSync(join(root, "app/lib/actions/dnd.ts"), "utf8");
check("REPO-12 atomic writes (move_node_to_folder + create_folder_with_nodes)",
  dnd.includes("move_node_to_folder") && dnd.includes("create_folder_with_nodes"));

// 13. no committed secrets in tracked files
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
const SECRET_RE = /sb_secret_[A-Za-z0-9_-]{10,}|sk_live_[A-Za-z0-9]{10,}|sk_test_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/;
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

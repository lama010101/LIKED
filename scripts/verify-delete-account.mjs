// verify-delete-account.mjs — rollback harness for migration 146
// (V2-W2-P0-05, PLAN P0-05): public.delete_account(p_user_id, p_email).
//
// Runs the migration SQL file text inside ONE transaction against
// DATABASE_URL, builds synthetic fixtures plus the two Appendix-A
// real accounts, executes every acceptance case, and ALWAYS issues
// ROLLBACK in a finally block. The script refuses to run if the
// migration file contains a COMMIT (or other transaction-control)
// statement. Nothing is ever committed; no Storage/auth writes.
//
// Usage: node scripts/verify-delete-account.mjs

import { config } from "dotenv";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import {
  COVERED_FKS,
  COVERED_UNREFERENCED_COLUMNS,
  COVERED_PAYLOAD_KEYS,
  findCoverageGaps,
} from "./lib/delete-account-coverage.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env.local") });

const LIKED_REF = "lzkzfqshnjvlzosnntfx";
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(LIKED_REF)) {
  console.error("ABORT: NEXT_PUBLIC_SUPABASE_URL is not the LIKED project");
  process.exit(3);
}
if (!process.env.DATABASE_URL) {
  console.error("ABORT: DATABASE_URL is not set");
  process.exit(3);
}

const MIGRATION = join(root, "supabase", "migrations", "146_v2_delete_account.sql");
const sqlText = readFileSync(MIGRATION, "utf8");

// Refuse to run if the migration contains transaction-control words
// (comments stripped first so '-- COMMIT' notes cannot false-positive).
const stripped = sqlText.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
if (/\b(commit|rollback|abort)\b/i.test(stripped) || /\b(begin|start)\s+(transaction|work)\b/i.test(stripped)) {
  console.error("REFUSE: migration file contains a transaction-control statement (COMMIT/ROLLBACK/BEGIN...)");
  process.exit(3);
}

const { default: pg } = await import("pg");
let connStr = process.env.DATABASE_URL;
const pw = connStr.match(/:([^:@]+)@/)?.[1];
if (connStr.includes(`db.${LIKED_REF}.supabase.co`)) {
  connStr = `postgresql://postgres.${LIKED_REF}:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
}
const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

// Harness safety (V2-W2-P0-05-FIX01): on SIGINT/SIGTERM/uncaught error,
// issue ROLLBACK and close — a killed run must never leave an
// idle-in-transaction session or locks behind on the live DB.
const shutdown = (why) => {
  console.log(`\n${why} — issuing ROLLBACK and closing connection`);
  setTimeout(() => process.exit(130), 8000).unref();
  (async () => {
    try { await client.query("ROLLBACK"); } catch { /* connection may be dead */ }
    try { client.release(); } catch { /* already released */ }
    try { await pool.end(); } catch { /* ignore */ }
    process.exit(130);
  })();
};
process.on("SIGINT", () => shutdown("SIGINT received"));
process.on("SIGTERM", () => shutdown("SIGTERM received"));
process.on("uncaughtException", (e) => shutdown(`UNCAUGHT EXCEPTION: ${e.message}`));
process.on("unhandledRejection", (e) => shutdown(`UNHANDLED REJECTION: ${e?.message ?? e}`));

// Session guardrails, set right after connect and before BEGIN.
await client.query(
  "SET idle_in_transaction_session_timeout = '60s'; " +
  "SET lock_timeout = '10s'; " +
  "SET statement_timeout = '120s'; " +
  "SET application_name = 'liked-harness-delete-account';"
);

// Pre-flight: refuse to run while ANOTHER 'liked-harness-*' session is
// parked idle-in-transaction (zombie from a previously killed run).
{
  const { rows: zombies } = await client.query(
    `SELECT pid, application_name, state, now() - xact_start AS xact_age
       FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND application_name LIKE 'liked-harness-%'
        AND state = 'idle in transaction'`
  );
  if (zombies.length > 0) {
    console.error(`ABORT: ${zombies.length} other 'liked-harness-*' session(s) idle in transaction — not running:`);
    for (const z of zombies) {
      console.error(`  pid=${z.pid} application_name=${z.application_name} state=${z.state} xact_age=${z.xact_age}`);
    }
    client.release();
    await pool.end();
    process.exit(2);
  }
}

const RUNTS = Date.now();
const RUN = RUNTS.toString(36);
const RUNID = String(RUNTS).slice(-6);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
};

async function trySql(text, params) {
  await client.query("SAVEPOINT sp_case");
  try {
    const res = await client.query(text, params);
    await client.query("RELEASE SAVEPOINT sp_case");
    return { threw: false, code: null, message: null, rows: res.rows };
  } catch (e) {
    try { await client.query("ROLLBACK TO SAVEPOINT sp_case"); } catch { /* tx already aborted */ }
    return { threw: true, code: e.code ?? null, message: e.message ?? "", rows: [] };
  }
}
const one = async (text, params) => (await client.query(text, params)).rows[0];
const all = async (text, params) => (await client.query(text, params)).rows;
const count = async (text, params) => Number((await one(text, params)).c);
const ins = async (text, params) => (await client.query(text, params)).rows[0];

// Tables whose committed row counts must be identical after ROLLBACK:
// every table named by the coverage module plus the blast-radius set.
const COVERED_TABLES = [...new Set([
  ...COVERED_FKS.map((f) => f.child),
  ...COVERED_UNREFERENCED_COLUMNS.map((c) => c.table),
  "submissions", "group_nodes", "nodes_sort_cache", "folder_tree",
  "items", "enrichment_jobs", "node_items", "organize_items", "tag_edges",
  "translations", "external_items_map", "deletion_requests", "rate_limits",
  "youtube_search_cache", "tmdb_genres", "item_availability",
  "item_availability_fetch",
])].sort();

const baseline = {};
for (const t of COVERED_TABLES) {
  baseline[t] = await count(`SELECT count(*)::int AS c FROM public.${t}`);
}
baseline["auth.users"] = await count(`SELECT count(*)::int AS c FROM auth.users`);
console.log(`baseline captured for ${COVERED_TABLES.length} public tables + auth.users`);

// generated zero-residue probe over the coverage module (item 11)
async function residueFor(uid) {
  const out = [];
  for (const f of COVERED_FKS) {
    const c = await count(`SELECT count(*)::int AS c FROM public.${f.child} WHERE ${f.column} = $1`, [uid]);
    if (c !== 0) out.push(`${f.child}.${f.column}=${c}`);
  }
  for (const c of COVERED_UNREFERENCED_COLUMNS) {
    const n = await count(`SELECT count(*)::int AS c FROM public.${c.table} WHERE ${c.column} = $1`, [uid]);
    if (c.handled_by === "ledger") {
      if (n !== 1) out.push(`${c.table}.${c.column}=ledger:${n}`);
    } else if (n !== 0) out.push(`${c.table}.${c.column}=${n}`);
  }
  return out;
}

try {
  await client.query("BEGIN");
  const existing = await one(
    `SELECT to_regprocedure('public.delete_account(uuid,text)') IS NOT NULL AS exists`
  );
  if (existing.exists) {
    console.log("== public.delete_account already exists; skipping migration 146 apply ==");
  } else {
    console.log("== applying migration 146 inside transaction ==");
    await client.query(sqlText);
    console.log("migration applied (uncommitted)");
  }
  await client.query(`SELECT set_config('request.jwt.claims','{"role":"service_role"}',true)`);

  // ---------------- (9) static checks on pg_get_functiondef ----------------
  console.log("\n== (9) static checks: functiondef ==");
  {
    const def = (await one(
      `SELECT pg_get_functiondef('public.delete_account(uuid,text)'::regprocedure) AS d`)).d;
    check("functiondef: no DELETE on edges", !/delete\s+from\s+public\.edges\b/i.test(def));
    check("functiondef: no DELETE on folder_edges", !/delete\s+from\s+public\.folder_edges\b/i.test(def));
    check("functiondef: no INSERT/UPDATE on edges|folder_edges",
      !/(insert\s+into|update)\s+public\.(edges|folder_edges)\b/i.test(def));
    check("functiondef: no EXCEPTION WHEN block", !/exception\s+when/i.test(def));
    check("functiondef: contains FOR UPDATE lock", /for\s+update/i.test(def));
    check("functiondef: contains service_role guard", /auth\.role\(\).*service_role/s.test(def));
  }

  // ---------------- (7a) validation + not_found (before fixtures) ----------------
  console.log("\n== (7a) validation: NULL user / bad email / unknown uuid ==");
  {
    const r1 = await trySql(`SELECT public.delete_account(NULL, 'a@b.co') AS j`);
    check("p_user_id NULL -> 22023 invalid user", r1.threw && r1.code === "22023" && /invalid user/i.test(r1.message), `${r1.code} ${r1.message}`);
    const r2 = await trySql(`SELECT public.delete_account($1, 'ab') AS j`, [randomUUID()]);
    check("p_email 'ab' -> 22023 invalid email", r2.threw && r2.code === "22023" && /invalid email/i.test(r2.message), `${r2.code} ${r2.message}`);
    const r3 = await trySql(`SELECT public.delete_account($1, 'valid@example.com') AS j`, [randomUUID()]);
    const j3 = r3.rows?.[0]?.j;
    check("unknown uuid -> {not_found:true}, no ledger row",
      !r3.threw && j3?.not_found === true && j3?.deleted === false,
      JSON.stringify(j3));
    const led = await count(`SELECT count(*)::int AS c FROM public.account_deletion_jobs`);
    check("no ledger row written for not_found", led === (await count(`SELECT count(*)::int AS c FROM public.account_deletion_jobs`)) , `ledger=${led}`);
  }

  // ---------------- fixtures ----------------
  console.log("\n== fixtures ==");
  const mkUser = async (name, norm) => (await ins(
    `INSERT INTO public.users (display_name, normalized_display_name) VALUES ($1,$2) RETURNING id`, [name, norm])).id;
  const U  = await mkUser("Harness Del U",  `harness-del-u-146-${RUN}`);
  const U2 = await mkUser("Harness Del U2", `harness-del-u2-146-${RUN}`);
  const O1 = await mkUser("Harness Del O1", `harness-del-o1-146-${RUN}`);
  const O2 = await mkUser("Harness Del O2", `harness-del-o2-146-${RUN}`);
  const X  = await mkUser("Harness Del X",  `harness-del-x-146-${RUN}`);

  const itemA = (await ins(`INSERT INTO public.items (source,kind,external_id,name,enrichment_status) VALUES ('tmdb','movie','91${RUNID}1','Harness A','pending') RETURNING id`)).id;
  const itemB = (await ins(`INSERT INTO public.items (source,kind,external_id,name,enrichment_status) VALUES ('tmdb','movie','91${RUNID}2','Harness B','pending') RETURNING id`)).id;
  const itemC = (await ins(`INSERT INTO public.items (source,kind,external_id,name,enrichment_status) VALUES ('tmdb','movie','91${RUNID}3','Harness C','pending') RETURNING id`)).id;

  const mkNode = async (owner, tag) => (await ins(
    `INSERT INTO public.nodes (owner_id, origin_user_id, node_type, url, title)
     VALUES ($1,$1,'link',$2,$3) RETURNING id`,
    [owner, `https://example.com/harness-${tag}-146-${RUN}`, `Harness Node ${tag}`])).id;
  const nodeU1 = await mkNode(U, "u1");
  const nodeU2 = await mkNode(U, "u2");
  const nodeO1 = await mkNode(O1, "o1");
  const nodeO2 = await mkNode(O2, "o2");

  const mkFolder = async (owner, name) => {
    const f = (await ins(
      `INSERT INTO public.folders (name, owner_id, color_hex) VALUES ($1,$2,'#336699') RETURNING id`, [name, owner])).id;
    await client.query(`INSERT INTO public.folder_tree (folder_id, ancestor_id, depth) VALUES ($1,$1,0)`, [f]);
    return f;
  };
  const folderU  = await mkFolder(U,  "Harness Folder U");
  const folderO1 = await mkFolder(O1, "Harness Folder O1");
  const folderO2 = await mkFolder(O2, "Harness Folder O2");

  const mkAsk = async (owner, tag) => (await ins(
    `INSERT INTO public.asks (owner_id, token, is_active) VALUES ($1,$2,true) RETURNING id`,
    [owner, `harness-ask-${tag}-146-${RUN}-` + "t".repeat(40)])).id;
  const askU  = await mkAsk(U,  "u");
  const askO1 = await mkAsk(O1, "o1");
  const askO2 = await mkAsk(O2, "o2");

  const mkContrib = async (name, hex) => (await ins(
    `INSERT INTO public.contributors (display_name, secret_hash) VALUES ($1, decode(repeat($2,32),'hex')) RETURNING id`,
    [name, hex])).id;
  const cG1 = await mkContrib("Harness G1", "a1");
  const cG4 = await mkContrib("Harness G4", "a4");
  const cG2 = await mkContrib("Harness G2", "a2");
  const cG3 = await mkContrib("Harness G3", "a3");
  const cOther = await mkContrib("Harness GOther", "b1");
  await client.query(`UPDATE public.contributors SET claimed_by_user_id=$1, claimed_at=now() WHERE id=$2`, [U, cG3]);

  // submissions + recommendations
  const mkSub = async (ask, contrib) => (await ins(
    `INSERT INTO public.submissions (ask_id, contributor_id, client_batch_id, title_count)
     VALUES ($1,$2,$3,2) RETURNING id`, [ask, contrib, randomUUID()])).id;
  const mkRec = async (owner, item, contrib, sub) => ins(
    `INSERT INTO public.recommendations (owner_id, item_id, contributor_id, submission_id, rating)
     VALUES ($1,$2,$3,$4,70)`, [owner, item, contrib, sub]);
  const sG1U = await mkSub(askU, cG1);  await mkRec(U, itemA, cG1, sG1U);
  const sG4U = await mkSub(askU, cG4);  await mkRec(U, itemB, cG4, sG4U);
  const sG2U = await mkSub(askU, cG2);  await mkRec(U, itemA, cG2, sG2U);
  const sG2O1 = await mkSub(askO1, cG2); await mkRec(O1, itemB, cG2, sG2O1);
  const sG3O1 = await mkSub(askO1, cG3); await mkRec(O1, itemB, cG3, sG3O1);
  const sG3O2 = await mkSub(askO2, cG3); await mkRec(O2, itemC, cG3, sG3O2);
  const sOtherO1 = await mkSub(askO1, cOther); await mkRec(O1, itemC, cOther, sOtherO1);
  const sOtherO2 = await mkSub(askO2, cOther); await mkRec(O2, itemB, cOther, sOtherO2);

  // user_prefs / owner_item_state / owner_contributor_blocks
  await client.query(`INSERT INTO public.user_prefs (user_id, region_code, tmdb_lang, notify_email) VALUES ($1,'FR','fr-FR',true)`, [U]);
  await client.query(`INSERT INTO public.owner_item_state (owner_id, item_id, status) VALUES ($1,$2,'to_watch')`, [U, itemA]);
  await client.query(`INSERT INTO public.owner_contributor_blocks (owner_id, contributor_id) VALUES ($1,$2)`, [U, cG2]);

  // email_outbox
  const mail = (owner, contrib) => client.query(
    `INSERT INTO public.email_outbox (owner_id, kind, payload, status)
     VALUES ($1,'recommendation_received',$2::jsonb,'pending')`,
    [owner, JSON.stringify({ contributor_id: contrib, contributor_name: "x", count: 1, ask_id: askU })]);
  await mail(U, cG1); await mail(U, cG2);
  await mail(O1, cG3); await mail(O2, cG3);
  await mail(O1, cG2); await mail(O1, cOther); await mail(O2, cOther);

  // youtube_search_budget (Pacific day)
  const pday = `(now() AT TIME ZONE 'America/Los_Angeles')::date`;
  await client.query(
    `INSERT INTO public.youtube_search_budget (day, scope, used) VALUES
     (${pday}, 'c:'||$1::text, 3), (${pday}, 'c:'||$2::text, 2), (${pday}, 'c:'||$3::text, 4),
     (${pday}, 'c:'||$4::text, 5), (${pday}, 'global_search', 9)`,
    [cG3, cG1, cG4, cG2]);

  // notifications
  const notif = (user, type, payload) => client.query(
    `INSERT INTO public.notifications (user_id, type, payload) VALUES ($1,$2,$3::jsonb)`,
    [user, type, JSON.stringify(payload)]);
  await notif(U, "recommendation_received", { contributor_id: cG1, contributor_name: "G1", count: 1, ask_id: askU, submission_id: sG1U });
  await notif(U, "recommendation_received", { contributor_id: cG2, contributor_name: "G2", count: 1, ask_id: askU, submission_id: sG2U });
  await notif(U, "recommendation_received", { contributor_id: cG4, contributor_name: "G4", count: 1, ask_id: askU, submission_id: sG4U });
  await notif(O1, "recommendation_received", { contributor_id: cG3, contributor_name: "G3", count: 1, ask_id: askO1, submission_id: sG3O1 });
  await notif(O2, "recommendation_received", { contributor_id: cG3, contributor_name: "G3", count: 1, ask_id: askO2, submission_id: sG3O2 });
  await notif(O1, "recommendation_received", { contributor_id: cOther, contributor_name: "GO", count: 1, ask_id: askO1, submission_id: sOtherO1 });
  await notif(O2, "recommendation_received", { contributor_id: cOther, contributor_name: "GO", count: 1, ask_id: askO2, submission_id: sOtherO2 });
  // A1 actor/sender fixtures
  await notif(O1, "folder_share", { sender_id: U, folder_id: folderO1, folder_name: "F", permission: "view" });
  await notif(O2, "share_received", { sender_id: U, node_id: nodeO1, node_title: "N", permission: "view" });
  await notif(O1, "folder_share", { actor_id: U, folder_id: folderO1, folder_name: "F", permission: "view" });
  await notif(O2, "share_received", { sender_id: O1, node_id: nodeO1, node_title: "N", permission: "view" }); // unrelated -> survives
  await notif(U, "folder_share", { sender_id: O1, folder_id: folderO1, folder_name: "F", permission: "view" });

  // youtube_connections / card_positions fixture IMPOSSIBLE for synthetic
  // users: both FK to auth.users and auth writes are forbidden. Step-9
  // coverage is exercised by the real accounts below (1 live row exists).

  // ratings + nodes_sort_cache
  await client.query(`INSERT INTO public.ratings (node_id, user_id, score) VALUES ($1,$2,60),($3,$2,70),($1,$4,80)`, [nodeO1, U, nodeO2, O1]);
  await client.query(
    `INSERT INTO public.nodes_sort_cache (node_id, avg_rating, view_count, share_count, updated_at) VALUES
     ($1, 50, 0, 0, now()), ($2, 50, 0, 0, now()), ($3, 0, 0, 0, now())`,
    [nodeO1, nodeO2, nodeU1]);

  // causes + edges
  const mkCause = async (type, by, meta, fg) => (await ins(
    `INSERT INTO public.causes (cause_type, created_by, metadata, folder_grant_id) VALUES ($1,$2,$3::jsonb,$4) RETURNING id`,
    [type, by, meta ? JSON.stringify(meta) : null, fg ?? null])).id;
  const mkEdge = async (node, user, cause, sender) => ins(
    `INSERT INTO public.edges (node_id, user_id, cause_id, sender_id, direction, permission) VALUES ($1,$2,$3,$4,'sent','view')`,
    [node, user, cause, sender ?? null]);
  const causeImpU = await mkCause("import", U);
  await mkEdge(nodeU1, U, causeImpU);
  const causeImpU2 = await mkCause("import", U);
  await mkEdge(nodeU2, U, causeImpU2);
  const causeShareU = await mkCause("direct_share", U, { node_id: nodeU1 });
  await mkEdge(nodeU1, O1, causeShareU, U);       // U shared own node to O1 (sender_id blocker)
  const causeO1share = await mkCause("direct_share", O1, { node_id: nodeO1 });
  await mkEdge(nodeO1, X, causeO1share, U);       // U shared O1's node to X (OR-branch of step 8)

  // folder_edges placements
  await client.query(`INSERT INTO public.folder_edges (node_id, folder_id, added_by) VALUES ($1,$2,$3)`, [nodeU1, folderU, U]);
  await client.query(`INSERT INTO public.folder_edges (node_id, folder_id, added_by) VALUES ($1,$2,$3)`, [nodeO1, folderO2, U]); // placement to remove
  await client.query(`INSERT INTO public.folder_edges (node_id, folder_id, added_by) VALUES ($1,$2,$3)`, [nodeO1, folderO1, O1]); // unrelated survives
  await client.query(`INSERT INTO public.folder_edges (node_id, folder_id, added_by) VALUES ($1,$2,$3)`, [nodeO2, folderO1, O1]);

  // folder_grants + folder_admins
  const grantUOwn = (await ins(
    `INSERT INTO public.folder_grants (folder_id, grantee_id, permission, granted_by) VALUES ($1,$2,'view',$3) RETURNING id`,
    [folderU, X, U])).id;                                    // U as granter
  const grantO1ToU = (await ins(
    `INSERT INTO public.folder_grants (folder_id, grantee_id, permission, granted_by) VALUES ($1,$2,'contribute',$3) RETURNING id`,
    [folderO1, U, O1])).id;                                  // U as grantee
  const grantO2ToX = (await ins(
    `INSERT INTO public.folder_grants (folder_id, grantee_id, permission, granted_by) VALUES ($1,$2,'contribute',$3) RETURNING id`,
    [folderO2, X, O2])).id;                                  // covering grant for expand fixture
  await client.query(`INSERT INTO public.folder_admins (folder_id, user_id, granted_by) VALUES ($1,$2,$3),($4,$5,$6)`,
    [folderU, X, U, folderO1, U, O1]);

  // folder_grant_expand cause + covering edge (revocation branch)
  const causeExp = await mkCause("folder_grant_expand", O2,
    { node_id: nodeO1, in_folder_id: folderO2 }, grantO2ToX);
  await mkEdge(nodeO1, X, causeExp, O2);

  // blocks both sides
  await client.query(`INSERT INTO public.blocks (blocker_id, blocked_id) VALUES ($1,$2),($2,$1)`, [U, X]);

  // categorization_suggestions + backup
  await client.query(`INSERT INTO public.categorization_suggestions (user_id, node_id, status) VALUES ($1,$2,'pending')`, [U, nodeU1]);
  await client.query(`INSERT INTO public.categorization_suggestions_backup_20260927 (user_id, node_id, status, suggested_tag_labels) VALUES ($1,$2,'pending','{}'::text[])`, [U, nodeU1]);

  // activity_log
  await client.query(`INSERT INTO public.activity_log (user_id, action) VALUES ($1,'harness_action')`, [U]);

  // direct chats + messages
  const chatUO1 = (await ins(`INSERT INTO public.direct_chats (user_1_id, user_2_id) VALUES ($1,$2) RETURNING id`, [U, O1])).id;
  await client.query(`INSERT INTO public.messages (chat_id, sender_id, content) VALUES ($1,$2,'from U'),($1,$3,'from O1')`, [chatUO1, U, O1]);

  // node_messages
  await client.query(`INSERT INTO public.node_messages (node_id, sender_id, content) VALUES ($1,$2,'u msg'),($1,$3,'o1 msg'),($4,$2,'u on o1 node')`,
    [nodeU1, U, O1, nodeO1]);

  // groups: owned by U + membership in O2's group
  const groupU = (await ins(`INSERT INTO public.groups (name, owner_id) VALUES ('Harness Group U',$1) RETURNING id`, [U])).id;
  const groupO2 = (await ins(`INSERT INTO public.groups (name, owner_id) VALUES ('Harness Group O2',$1) RETURNING id`, [O2])).id;
  await client.query(`INSERT INTO public.group_members (group_id, user_id) VALUES ($1,$2),($1,$3),($4,$2),($4,$5)`, [groupU, U, O1, groupO2, O2]);
  await client.query(`INSERT INTO public.group_admins (group_id, user_id, granted_by) VALUES ($1,$2,$2),($1,$3,$2),($4,$2,$5)`, [groupU, U, O1, groupO2, O2]);
  await client.query(`INSERT INTO public.group_messages (group_id, sender_id, content) VALUES ($1,$2,'gu'),($1,$3,'go1'),($4,$2,'gu in o2'),($4,$5,'go2 own')`, [groupU, U, O1, groupO2, O2]);
  await client.query(`INSERT INTO public.group_nodes (group_id, node_id) VALUES ($1,$2),($3,$4)`, [groupU, nodeU1, groupO2, nodeO1]);

  console.log("fixtures created");

  // derived-count baselines (plain SQL, pre-delete)
  const dc = async (owner, item) => count(
    `SELECT count(DISTINCT contributor_id)::int AS c FROM public.recommendations WHERE owner_id=$1 AND item_id=$2`, [owner, item]);
  const preO1B = await dc(O1, itemB);   // expect 2 (cG3+cG2)
  const preO1C = await dc(O1, itemC);   // expect 1 (cOther)
  const preO2C = await dc(O2, itemC);   // expect 1 (cG3)
  const preO2B = await dc(O2, itemB);   // expect 1 (cOther)

  // ---------------- main case: delete_account(U) ----------------
  console.log("\n== case: delete_account(U) ==");
  const P_EMAIL = "harness-del-u@example.com";
  const t0 = Date.now();
  const res = await one(`SELECT public.delete_account($1,$2) AS j`, [U, P_EMAIL]);
  const elapsed = Date.now() - t0;
  const j = res.j;
  console.log(`delete_account(U) elapsed=${elapsed}ms result=${JSON.stringify(j)}`);
  check("returns already:false deleted:true", j?.already === false && j?.deleted === true, JSON.stringify(j).slice(0, 400));
  check("counts object present with step keys", j?.counts && typeof j.counts === "object" && Object.keys(j.counts).length >= 10, Object.keys(j?.counts ?? {}).join(","));

  const gone = async (label, sql, params, expectZero = true) => {
    const n = await count(sql, params);
    check(`${label} -> ${expectZero ? "0" : ">0"}`, expectZero ? n === 0 : n > 0, `n=${n}`);
    return n;
  };
  await gone("users row U", `SELECT count(*)::int AS c FROM public.users WHERE id=$1`, [U]);
  await gone("user_prefs U", `SELECT count(*)::int AS c FROM public.user_prefs WHERE user_id=$1`, [U]);
  await gone("asks owner U", `SELECT count(*)::int AS c FROM public.asks WHERE owner_id=$1`, [U]);
  await gone("owner_item_state U", `SELECT count(*)::int AS c FROM public.owner_item_state WHERE owner_id=$1`, [U]);
  await gone("owner_contributor_blocks U", `SELECT count(*)::int AS c FROM public.owner_contributor_blocks WHERE owner_id=$1`, [U]);
  await gone("recommendations owner U", `SELECT count(*)::int AS c FROM public.recommendations WHERE owner_id=$1`, [U]);
  await gone("submissions to askU", `SELECT count(*)::int AS c FROM public.submissions s JOIN public.asks a ON a.id=s.ask_id WHERE a.owner_id=$1`, [U]);
  await gone("contributors cG1", `SELECT count(*)::int AS c FROM public.contributors WHERE id=$1`, [cG1]);
  await gone("contributors cG4", `SELECT count(*)::int AS c FROM public.contributors WHERE id=$1`, [cG4]);
  await gone("contributors cG3 (claimed)", `SELECT count(*)::int AS c FROM public.contributors WHERE id=$1`, [cG3]);
  const keepG2 = await count(`SELECT count(*)::int AS c FROM public.contributors WHERE id=$1`, [cG2]);
  check("contributors cG2 kept (wrote to U+O1)", keepG2 === 1, `n=${keepG2}`);
  const keepOther = await count(`SELECT count(*)::int AS c FROM public.contributors WHERE id=$1`, [cOther]);
  check("contributors cOther kept", keepOther === 1, `n=${keepOther}`);
  await gone("cG3 recommendations anywhere", `SELECT count(*)::int AS c FROM public.recommendations WHERE contributor_id=$1`, [cG3]);
  await gone("cG3 submissions anywhere", `SELECT count(*)::int AS c FROM public.submissions WHERE contributor_id=$1`, [cG3]);
  await gone("cG3 notifications anywhere", `SELECT count(*)::int AS c FROM public.notifications WHERE payload->>'contributor_id'=$1`, [cG3]);
  await gone("cG3 email_outbox anywhere", `SELECT count(*)::int AS c FROM public.email_outbox WHERE payload->>'contributor_id'=$1`, [cG3]);
  await gone("cG3 budget rows", `SELECT count(*)::int AS c FROM public.youtube_search_budget WHERE scope='c:'||$1::text`, [cG3]);
  await gone("cG1 budget rows", `SELECT count(*)::int AS c FROM public.youtube_search_budget WHERE scope='c:'||$1::text`, [cG1]);
  await gone("cG4 budget rows", `SELECT count(*)::int AS c FROM public.youtube_search_budget WHERE scope='c:'||$1::text`, [cG4]);
  const keepG2Budget = await count(`SELECT count(*)::int AS c FROM public.youtube_search_budget WHERE scope='c:'||$1::text`, [cG2]);
  check("cG2 budget row kept", keepG2Budget === 1, `n=${keepG2Budget}`);
  const keepGlobal = await count(`SELECT count(*)::int AS c FROM public.youtube_search_budget WHERE scope='global_search'`);
  check("global_search budget kept", keepGlobal === 1, `n=${keepGlobal}`);
  await gone("email_outbox owner U", `SELECT count(*)::int AS c FROM public.email_outbox WHERE owner_id=$1`, [U]);
  const keepMailOther = await count(`SELECT count(*)::int AS c FROM public.email_outbox WHERE payload->>'contributor_id'=$1`, [cOther]);
  check("cOther email_outbox rows kept (2)", keepMailOther === 2, `n=${keepMailOther}`);
  const keepMailG2 = await count(`SELECT count(*)::int AS c FROM public.email_outbox WHERE payload->>'contributor_id'=$1`, [cG2]);
  check("cG2 email_outbox row kept", keepMailG2 === 1, `n=${keepMailG2}`);
  await gone("notifications user_id U", `SELECT count(*)::int AS c FROM public.notifications WHERE user_id=$1`, [U]);
  await gone("notifications payload actor_id=U", `SELECT count(*)::int AS c FROM public.notifications WHERE payload->>'actor_id'=$1`, [U]);
  await gone("notifications payload sender_id=U", `SELECT count(*)::int AS c FROM public.notifications WHERE payload->>'sender_id'=$1`, [U]);
  const keepNotifOther = await count(`SELECT count(*)::int AS c FROM public.notifications WHERE payload->>'sender_id'=$1`, [O1]);
  check("unrelated sender_id=O1 notification kept", keepNotifOther === 1, `n=${keepNotifOther}`);
  const keepNotifRec = await count(`SELECT count(*)::int AS c FROM public.notifications WHERE type='recommendation_received' AND payload->>'contributor_id'=$1`, [cOther]);
  check("cOther recommendation notifications kept (2)", keepNotifRec === 2, `n=${keepNotifRec}`);
  await gone("youtube_connections U", `SELECT count(*)::int AS c FROM public.youtube_connections WHERE user_id=$1`, [U]);
  await gone("card_positions U", `SELECT count(*)::int AS c FROM public.card_positions WHERE user_id=$1`, [U]);
  await gone("ratings user U", `SELECT count(*)::int AS c FROM public.ratings WHERE user_id=$1`, [U]);
  const avgO1 = await one(`SELECT avg_rating FROM public.nodes_sort_cache WHERE node_id=$1`, [nodeO1]);
  check("nodes_sort_cache nodeO1 avg_rating recomputed to 80", avgO1 && Number(avgO1.avg_rating) === 80, JSON.stringify(avgO1));
  const avgO2 = await one(`SELECT avg_rating FROM public.nodes_sort_cache WHERE node_id=$1`, [nodeO2]);
  check("nodes_sort_cache nodeO2 avg_rating NULL (only U rated)", avgO2 && avgO2.avg_rating === null, JSON.stringify(avgO2));
  await gone("nodes owned U", `SELECT count(*)::int AS c FROM public.nodes WHERE owner_id=$1`, [U]);
  await gone("folders owned U", `SELECT count(*)::int AS c FROM public.folders WHERE owner_id=$1`, [U]);
  await gone("edges user_id U", `SELECT count(*)::int AS c FROM public.edges WHERE user_id=$1`, [U]);
  await gone("edges sender_id U", `SELECT count(*)::int AS c FROM public.edges WHERE sender_id=$1`, [U]);
  await gone("causes created_by U", `SELECT count(*)::int AS c FROM public.causes WHERE created_by=$1`, [U]);
  await gone("folder_edges added_by U", `SELECT count(*)::int AS c FROM public.folder_edges WHERE added_by=$1`, [U]);
  await gone("ratings residual", `SELECT count(*)::int AS c FROM public.ratings WHERE user_id=$1`, [U]);
  // placement + survival
  await gone("placement nodeO1->folderO2", `SELECT count(*)::int AS c FROM public.folder_edges WHERE node_id=$1 AND folder_id=$2`, [nodeO1, folderO2]);
  const nO1 = await count(`SELECT count(*)::int AS c FROM public.nodes WHERE id=$1`, [nodeO1]);
  const fO2 = await count(`SELECT count(*)::int AS c FROM public.folders WHERE id=$1`, [folderO2]);
  check("nodeO1 + folderO2 survive", nO1 === 1 && fO2 === 1, `node=${nO1} folder=${fO2}`);
  const keepPlace = await count(`SELECT count(*)::int AS c FROM public.folder_edges WHERE node_id=$1 AND folder_id=$2 AND added_by=$3`, [nodeO1, folderO1, O1]);
  check("unrelated placement nodeO1->folderO1 kept", keepPlace === 1, `n=${keepPlace}`);
  await gone("expand cause", `SELECT count(*)::int AS c FROM public.causes WHERE id=$1`, [causeExp]);
  await gone("expand cause edges", `SELECT count(*)::int AS c FROM public.edges WHERE cause_id=$1`, [causeExp]);
  const keepGrant = await count(`SELECT count(*)::int AS c FROM public.folder_grants WHERE id=$1`, [grantO2ToX]);
  check("covering grant folderO2->X kept", keepGrant === 1, `n=${keepGrant}`);
  const keepGrantU = await count(`SELECT count(*)::int AS c FROM public.folder_grants WHERE grantee_id=$1 OR granted_by=$1`, [U]);
  check("no folder_grants reference U", keepGrantU === 0, `n=${keepGrantU}`);
  await gone("folder_admins ref U", `SELECT count(*)::int AS c FROM public.folder_admins WHERE user_id=$1 OR granted_by=$1`, [U]);
  await gone("blocks ref U", `SELECT count(*)::int AS c FROM public.blocks WHERE blocker_id=$1 OR blocked_id=$1`, [U]);
  await gone("categorization_suggestions U", `SELECT count(*)::int AS c FROM public.categorization_suggestions WHERE user_id=$1`, [U]);
  await gone("categorization_backup U", `SELECT count(*)::int AS c FROM public.categorization_suggestions_backup_20260927 WHERE user_id=$1`, [U]);
  await gone("activity_log U", `SELECT count(*)::int AS c FROM public.activity_log WHERE user_id=$1`, [U]);
  await gone("direct_chats U", `SELECT count(*)::int AS c FROM public.direct_chats WHERE user_1_id=$1 OR user_2_id=$1`, [U]);
  await gone("messages in U chats", `SELECT count(*)::int AS c FROM public.messages m JOIN public.direct_chats d ON d.id=m.chat_id WHERE d.user_1_id=$1 OR d.user_2_id=$1`, [U]);
  await gone("node_messages sender U", `SELECT count(*)::int AS c FROM public.node_messages WHERE sender_id=$1`, [U]);
  await gone("groupU", `SELECT count(*)::int AS c FROM public.groups WHERE id=$1`, [groupU]);
  await gone("groupU members", `SELECT count(*)::int AS c FROM public.group_members WHERE group_id=$1`, [groupU]);
  await gone("groupU admins", `SELECT count(*)::int AS c FROM public.group_admins WHERE group_id=$1`, [groupU]);
  await gone("groupU messages", `SELECT count(*)::int AS c FROM public.group_messages WHERE group_id=$1`, [groupU]);
  await gone("groupU nodes", `SELECT count(*)::int AS c FROM public.group_nodes WHERE group_id=$1`, [groupU]);
  const keepGroupO2 = await count(`SELECT count(*)::int AS c FROM public.groups WHERE id=$1`, [groupO2]);
  check("groupO2 survives", keepGroupO2 === 1, `n=${keepGroupO2}`);
  await gone("groupO2 member U", `SELECT count(*)::int AS c FROM public.group_members WHERE group_id=$1 AND user_id=$2`, [groupO2, U]);
  await gone("groupO2 admin U", `SELECT count(*)::int AS c FROM public.group_admins WHERE group_id=$1 AND (user_id=$2 OR granted_by=$2)`, [groupO2, U]);
  await gone("groupO2 messages sender U", `SELECT count(*)::int AS c FROM public.group_messages WHERE group_id=$1 AND sender_id=$2`, [groupO2, U]);
  const keepG2Msg = await count(`SELECT count(*)::int AS c FROM public.group_messages WHERE group_id=$1 AND sender_id=$2`, [groupO2, O2]);
  check("groupO2 O2's own message kept", keepG2Msg === 1, `n=${keepG2Msg}`);
  // derived counts after
  const postO1B = await dc(O1, itemB);
  const postO1C = await dc(O1, itemC);
  const postO2C = await dc(O2, itemC);
  const postO2B = await dc(O2, itemB);
  check("O1/itemB distinct contributors 2->1", preO1B === 2 && postO1B === 1, `${preO1B}->${postO1B}`);
  check("O1/itemC distinct contributors 1->1", preO1C === 1 && postO1C === 1, `${preO1C}->${postO1C}`);
  check("O2/itemC distinct contributors 1->0", preO2C === 1 && postO2C === 0, `${preO2C}->${postO2C}`);
  check("O2/itemB distinct contributors 1->1", preO2B === 1 && postO2B === 1, `${preO2B}->${postO2B}`);

  // zero-residue for U (covered set; ledger exempt -> expect exactly 1)
  {
    const resU = await residueFor(U);
    check("zero residue across COVERED_FKS+UNREFERENCED for U", resU.length === 0, resU.join("; ") || "clean");
    const ledU = await all(`SELECT stage, email, attempts FROM public.account_deletion_jobs WHERE user_id=$1`, [U]);
    check("ledger: exactly 1 row stage=storage email=p_email attempts=0",
      ledU.length === 1 && ledU[0].stage === "storage" && ledU[0].email === P_EMAIL && ledU[0].attempts === 0,
      JSON.stringify(ledU));
  }

  // ---------------- idempotency ----------------
  console.log("\n== case: idempotency / ledger ==");
  {
    const before = await all(`SELECT * FROM public.account_deletion_jobs WHERE user_id=$1`, [U]);
    const t1 = Date.now();
    const r2 = await one(`SELECT public.delete_account($1,$2) AS j`, [U, P_EMAIL]);
    const e2 = Date.now() - t1;
    console.log(`second call elapsed=${e2}ms result=${JSON.stringify(r2.j)}`);
    check("second call {already:true,deleted:false}", r2.j?.already === true && r2.j?.deleted === false, JSON.stringify(r2.j));
    const after = await all(`SELECT * FROM public.account_deletion_jobs WHERE user_id=$1`, [U]);
    check("ledger unchanged after second call", JSON.stringify(before) === JSON.stringify(after), `rows=${after.length}`);
    const r3 = await one(`SELECT public.delete_account($1,$2) AS j`, [randomUUID(), "x@y.zz"]);
    check("random uuid -> {not_found:true}", r3.j?.not_found === true && r3.j?.deleted === false, JSON.stringify(r3.j));
    const ledAll = await count(`SELECT count(*)::int AS c FROM public.account_deletion_jobs`);
    check("no phantom ledger rows", ledAll === 1, `ledger=${ledAll}`);
    const u2users = await count(`SELECT count(*)::int AS c FROM public.users WHERE id=$1`, [U2]);
    check("U2 untouched", u2users === 1, `n=${u2users}`);
  }

  // ---------------- U2 with NULL email ----------------
  console.log("\n== case: p_email NULL ==");
  {
    const r = await one(`SELECT public.delete_account($1,NULL) AS j`, [U2]);
    check("p_email NULL -> deleted:true", r.j?.deleted === true && r.j?.already === false, JSON.stringify(r.j).slice(0, 200));
    const led = await one(`SELECT email, stage FROM public.account_deletion_jobs WHERE user_id=$1`, [U2]);
    check("U2 ledger email NULL stage storage", led && led.email === null && led.stage === "storage", JSON.stringify(led));
  }

  // ---------------- real accounts (Appendix A) ----------------
  console.log("\n== case: real accounts (Appendix A) ==");
  const REAL = [
    { id: "5355c879-a734-40be-9699-1cb1b2572cff", tag: "laurent" },
    { id: "8d10c9d1-8fd5-47a2-aca7-e48ce5c17fb7", tag: "a@a.com" },
  ];
  const acctCounts = async (uid) => ({
    nodes_owned: await count(`SELECT count(*)::int AS c FROM public.nodes WHERE owner_id=$1`, [uid]),
    folders_owned: await count(`SELECT count(*)::int AS c FROM public.folders WHERE owner_id=$1`, [uid]),
    edges_user: await count(`SELECT count(*)::int AS c FROM public.edges WHERE user_id=$1`, [uid]),
    edges_sender: await count(`SELECT count(*)::int AS c FROM public.edges WHERE sender_id=$1`, [uid]),
    ratings: await count(`SELECT count(*)::int AS c FROM public.ratings WHERE user_id=$1`, [uid]),
    folder_edges_added_by: await count(`SELECT count(*)::int AS c FROM public.folder_edges WHERE added_by=$1`, [uid]),
  });
  // uninvolved control account (zero-link real user)
  const CTRL = "f8599a24-f5a4-41cd-bffd-2bff37b14bbb";
  const ctrlBefore = await acctCounts(CTRL);
  for (const acc of REAL) {
    const ledPre = await count(`SELECT count(*)::int AS c FROM public.account_deletion_jobs WHERE user_id=$1`, [acc.id]);
    if (ledPre > 0) { console.log(`SKIP ${acc.tag}: ledger row already exists`); continue; }
    const before = await acctCounts(acc.id);
    console.log(`${acc.tag} BEFORE ${JSON.stringify(before)}`);
    const tA = Date.now();
    const rr = await one(`SELECT public.delete_account($1,$2) AS j`, [acc.id, `${acc.tag}@verify.local`]);
    const eA = Date.now() - tA;
    const after = await acctCounts(acc.id);
    console.log(`${acc.tag} AFTER  ${JSON.stringify(after)}  elapsed=${eA}ms`);
    console.log(`${acc.tag} counts=${JSON.stringify(rr.j?.counts ?? {})}`);
    check(`${acc.tag} deleted:true`, rr.j?.deleted === true && rr.j?.already === false, JSON.stringify(rr.j).slice(0, 200));
    for (const k of Object.keys(after)) {
      check(`${acc.tag} ${k} -> 0`, after[k] === 0, `before=${before[k]} after=${after[k]}`);
    }
    const resA = await residueFor(acc.id);
    check(`${acc.tag} zero residue across covered set`, resA.length === 0, resA.join("; ") || "clean");
    console.log(`${acc.tag} elapsed=${eA}ms (service_role statement_timeout=2min)`);
    if (eA > 5000) console.log(`WARN ${acc.tag}: call exceeded 5s — route/PostgREST timeout risk UNVERIFIED`);
  }
  const ctrlAfter = await acctCounts(CTRL);
  check("uninvolved account counts identical", JSON.stringify(ctrlBefore) === JSON.stringify(ctrlAfter),
    `${JSON.stringify(ctrlBefore)} -> ${JSON.stringify(ctrlAfter)}`);

  // ---------------- (10) coverage guard ----------------
  console.log("\n== (10) coverage guard: findCoverageGaps on live catalog ==");
  {
    const liveFks = (await all(
      `SELECT cl.relname AS child, a.attname AS column, n.nspname||'.'||ref.relname AS parent,
              CASE c.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' WHEN 'r' THEN 'RESTRICT' END AS on_delete
       FROM pg_constraint c JOIN pg_class cl ON cl.oid=c.conrelid JOIN pg_namespace ns ON ns.oid=cl.relnamespace
       JOIN pg_class ref ON ref.oid=c.confrelid JOIN pg_namespace n ON n.oid=ref.relnamespace
       JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=ANY(c.conkey)
       WHERE c.contype='f' AND ns.nspname='public' AND ((n.nspname='public' AND ref.relname='users') OR n.nspname='auth')`))
      .map((r) => ({ child: r.child, column: r.column, parent: r.parent, on_delete: r.on_delete }));
    const liveColumns = (await all(
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
       WHERE NOT EXISTS (SELECT 1 FROM fks WHERE fks.child=cols.table_name AND fks.col=cols.column_name)`))
      .map((r) => ({ table: r.table, column: r.column }));
    const livePayloadKeys = [];
    for (const r of await all(
      `SELECT 'notifications' AS table, n.type AS type_or_kind, k.key
       FROM public.notifications n CROSS JOIN LATERAL jsonb_each_text(n.payload) AS k(key, value)
       UNION ALL
       SELECT 'email_outbox', e.kind, k.key
       FROM public.email_outbox e CROSS JOIN LATERAL jsonb_each_text(e.payload) AS k(key, value)`)) {
      livePayloadKeys.push({ table: r.table, type_or_kind: r.type_or_kind, key: r.key });
    }
    const livePayloadKeysDedup = [...new Map(livePayloadKeys.map((p) => [`${p.table}|${p.type_or_kind}|${p.key}`, p])).values()];
    console.log(`live: ${liveFks.length} FKs, ${liveColumns.length} unreferenced cols, ${livePayloadKeysDedup.length} payload keys`);
    const gaps = findCoverageGaps({ liveFks, liveColumns, livePayloadKeys: livePayloadKeysDedup });
    check("findCoverageGaps(live) EMPTY", gaps.length === 0, gaps.join("; ") || "no gaps");
    // pure-JS negative tests
    const savedFk = COVERED_FKS[COVERED_FKS.length - 1];
    COVERED_FKS.pop();
    const g1 = findCoverageGaps({ liveFks: [savedFk], liveColumns: [], livePayloadKeys: [] });
    COVERED_FKS.push(savedFk);
    check("negative: uncovered FK reported", g1.length === 1 && g1[0].includes("uncovered FK"), g1.join(";"));
    const g2 = findCoverageGaps({ liveFks: [], liveColumns: [{ table: "mystery", column: "user_id" }], livePayloadKeys: [] });
    check("negative: unreferenced column reported", g2.length === 1 && g2[0].includes("mystery.user_id"), g2.join(";"));
    const g3 = findCoverageGaps({ liveFks: [], liveColumns: [], livePayloadKeys: [{ table: "notifications", type_or_kind: "new_type", key: "user_id" }] });
    check("negative: unknown payload key reported", g3.length === 1 && g3[0].includes("new_type.user_id"), g3.join(";"));
    console.log(`COVERED_FKS=${COVERED_FKS.length} UNREFERENCED=${COVERED_UNREFERENCED_COLUMNS.length} PAYLOAD_KEYS=${COVERED_PAYLOAD_KEYS.length}`);
  }

  // ---------------- (7b) authz + ACL (LAST: SET LOCAL ROLE) ----------------
  console.log("\n== (7b) authz: anon / authenticated / claim variants ==");
  {
    const meta = await one(
      `SELECT p.prosecdef, p.proconfig, p.proacl::text AS proacl
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname='delete_account'`);
    console.log(`prosecdef=${meta.prosecdef} proconfig=${JSON.stringify(meta.proconfig)} proacl=${meta.proacl}`);
    check("prosecdef=true", meta.prosecdef === true);
    check("proconfig search_path=public", (meta.proconfig ?? []).some((c) => c === "search_path=public"), JSON.stringify(meta.proconfig));
    check("proacl exactly {postgres,service_role}", meta.proacl === "{postgres=X/postgres,service_role=X/postgres}", meta.proacl);
    for (const role of ["anon", "authenticated"]) {
      await client.query(`SET LOCAL ROLE ${role}`);
      const r = await trySql(`SELECT public.delete_account($1,$2) AS j`, [randomUUID(), "a@b.co"]);
      check(`${role} -> 42501`, r.threw && r.code === "42501", `${r.code} ${r.message}`);
      await client.query(`RESET ROLE`);
    }
    await client.query(`SELECT set_config('request.jwt.claims','{}',true)`);
    const rNull = await trySql(`SELECT public.delete_account($1,$2) AS j`, [randomUUID(), "a@b.co"]);
    check("claims role NULL -> 42501", rNull.threw && rNull.code === "42501", `${rNull.code} ${rNull.message}`);
    await client.query(`SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true)`);
    const rAuth = await trySql(`SELECT public.delete_account($1,$2) AS j`, [randomUUID(), "a@b.co"]);
    check("claims role=authenticated -> 42501", rAuth.threw && rAuth.code === "42501", `${rAuth.code} ${rAuth.message}`);
    await client.query(`SELECT set_config('request.jwt.claims','{"role":"service_role"}',true)`);
  }

  console.log(`\n===== HARNESS RESULT: ${pass} passed, ${fail} failed =====`);
} catch (e) {
  fail++;
  console.log(`HARNESS ERROR: ${e.message}`);
} finally {
  try { await client.query("ROLLBACK"); console.log("ROLLBACK issued — transaction discarded, nothing committed"); }
  catch (e) { console.log(`ROLLBACK failed: ${e.message}`); }
  client.release();
  await pool.end();
}

// ---------------- residue check (post-rollback, committed state) ----------------
{
  const pool2 = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
  const c2 = await pool2.connect();
  try {
    let residue = 0;
    for (const t of COVERED_TABLES) {
      const now = Number((await c2.query(`SELECT count(*)::int AS c FROM public.${t}`)).rows[0].c);
      if (now !== baseline[t]) { residue++; console.log(`RESIDUE  ${t}: before=${baseline[t]} after=${now}`); }
    }
    const nowAuth = Number((await c2.query(`SELECT count(*)::int AS c FROM auth.users`)).rows[0].c);
    if (nowAuth !== baseline["auth.users"]) { residue++; console.log(`RESIDUE  auth.users: before=${baseline["auth.users"]} after=${nowAuth}`); }
    const markerUsers = Number((await c2.query(`SELECT count(*)::int AS c FROM public.users WHERE normalized_display_name LIKE 'harness-%'`)).rows[0].c);
    const markerItems = Number((await c2.query(`SELECT count(*)::int AS c FROM public.items WHERE external_id LIKE '91${RUNID}%'`)).rows[0].c);
    const markerNodes = Number((await c2.query(`SELECT count(*)::int AS c FROM public.nodes WHERE url LIKE '%harness-%-146-${RUN}'`)).rows[0].c);
    if (markerUsers) { residue++; console.log(`RESIDUE  users harness markers: ${markerUsers}`); }
    if (markerItems) { residue++; console.log(`RESIDUE  items harness markers: ${markerItems}`); }
    if (markerNodes) { residue++; console.log(`RESIDUE  nodes harness markers: ${markerNodes}`); }
    console.log(residue === 0 ? "RESIDUE CHECK: zero residue — all table counts identical to pre-run baseline" : `RESIDUE CHECK: ${residue} table(s) differ`);
  } finally { c2.release(); await pool2.end(); }
}

process.exit(fail === 0 ? 0 : 1);

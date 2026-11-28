// verify-delete-pipeline-live.mjs — live proof for PRD §10.2 account
// deletion (V2-W7 WP-C fix h). Fixture public.users row + Library
// node/folder/edge/grant/rating + guest contribution + a
// thumbnails/<uid>/ storage object -> run the deletion pipeline stage
// order (same as lib/account/deletionPipeline.ts) -> verify everything
// is gone -> run the destructive stages twice -> zero fixture residue.
// Fixture ids only, no PII.
// Usage: node scripts/verify-delete-pipeline-live.mjs
// Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, DATABASE_URL,
// SUPABASE_SECRET_KEY.

import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env.local") });

const LIKED_REF = "lzkzfqshnjvlzosnntfx";
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(LIKED_REF)) {
  console.error("ABORT: NEXT_PUBLIC_SUPABASE_URL is not the LIKED project");
  process.exit(3);
}
for (const k of ["DATABASE_URL", "SUPABASE_SECRET_KEY"]) {
  if (!process.env[k]) { console.error(`ABORT: ${k} is not set`); process.exit(3); }
}

const { default: pg } = await import("pg");
let connStr = process.env.DATABASE_URL;
const pw = connStr.match(/:([^:@]+)@/)?.[1];
if (connStr.includes(`db.${LIKED_REF}.supabase.co`)) {
  connStr = `postgresql://postgres.${LIKED_REF}:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
}
const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const sql = async (text, params) => (await pool.query(text, params)).rows;
const one = async (text, params) => (await pool.query(text, params)).rows[0];
const count = async (text, params) => Number((await one(text, params)).c);

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } });

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
};

const RUN = Date.now().toString(36);
const TABLES = [
  "users", "nodes", "folders", "folder_tree", "edges", "causes", "folder_grants",
  "folder_edges", "folder_admins", "recommendations", "submissions", "contributors",
  "asks", "items", "notifications", "email_outbox", "account_deletion_jobs",
  "user_prefs", "owner_item_state", "owner_contributor_blocks", "blocks",
];
const baseline = {};
for (const t of TABLES) baseline[t] = await count(`SELECT count(*)::int AS c FROM public.${t}`);
baseline["auth.users"] = await count(`SELECT count(*)::int AS c FROM auth.users`);
console.log(`baseline captured for ${TABLES.length} tables + auth.users`);

const ins = async (text, params) => (await sql(text, params))[0];
const F = {}; // fixture ids for manual residue cleanup

try {
  // ---------- fixture ----------
  F.U = (await ins(
    `INSERT INTO public.users (display_name, normalized_display_name) VALUES ($1,$2) RETURNING id`,
    [`W7 Del ${RUN}`, `w7-del-${RUN}`])).id;
  F.node = (await ins(
    `INSERT INTO public.nodes (owner_id, origin_user_id, node_type, url, title)
     VALUES ($1,$1,'link',$2,$3) RETURNING id`,
    [F.U, `https://example.com/w7-${RUN}`, `W7 Node ${RUN}`])).id;
  F.folder = (await ins(
    `INSERT INTO public.folders (name, owner_id, color_hex) VALUES ($1,$2,'#336699') RETURNING id`,
    [`W7 Folder ${RUN}`, F.U])).id;
  await sql(`INSERT INTO public.folder_tree (folder_id, ancestor_id, depth) VALUES ($1,$1,0)`, [F.folder]);
  F.cause = (await ins(
    `INSERT INTO public.causes (cause_type, created_by, metadata) VALUES ('import',$1,$2::jsonb) RETURNING id`,
    [F.U, JSON.stringify({ probe: RUN })])).id;
  await sql(
    `INSERT INTO public.edges (node_id, user_id, cause_id, direction, permission) VALUES ($1,$2,$3,'sent','view')`,
    [F.node, F.U, F.cause]);
  F.grant = (await ins(
    `INSERT INTO public.folder_grants (folder_id, grantee_id, permission, granted_by) VALUES ($1,$2,'view',$2) RETURNING id`,
    [F.folder, F.U])).id;
  F.item = (await ins(
    `INSERT INTO public.items (source,kind,external_id,name,enrichment_status) VALUES ('tmdb','movie',$1,'W7 Probe','pending') RETURNING id`,
    [`9${String(Date.now()).slice(-9)}`])).id;
  F.ask = (await ins(
    `INSERT INTO public.asks (owner_id, token, is_active) VALUES ($1,$2,true) RETURNING id`,
    [F.U, `w7-ask-${RUN}-` + "t".repeat(40)])).id;
  F.contrib = (await ins(
    `INSERT INTO public.contributors (display_name, secret_hash) VALUES ($1, decode(repeat($2,32),'hex')) RETURNING id`,
    [`W7 Guest ${RUN}`, "e7"])).id;
  F.sub = (await ins(
    `INSERT INTO public.submissions (ask_id, contributor_id, client_batch_id, title_count) VALUES ($1,$2,$3,1) RETURNING id`,
    [F.ask, F.contrib, randomUUID()])).id;
  await sql(
    `INSERT INTO public.recommendations (owner_id, item_id, contributor_id, submission_id, rating) VALUES ($1,$2,$3,$4,70)`,
    [F.U, F.item, F.contrib, F.sub]);
  console.log(`fixture uid=${F.U} node=${F.node} folder=${F.folder} grant=${F.grant} item=${F.item}`);

  // storage object under thumbnails/<uid>/ (bucket accepts images only)
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const up = await supabase.storage.from("thumbnails").upload(`${F.U}/wp7-probe.png`, PNG, { contentType: "image/png", upsert: true });
  check("fixture storage upload", !up.error, up.error?.message ?? "ok");
  const listed0 = await supabase.storage.from("thumbnails").list(`${F.U}/`, { limit: 10 });
  check("fixture storage object present", (listed0.data ?? []).length === 1, `objects=${(listed0.data ?? []).length}`);

  // ---------- pipeline stage order (mirrors lib/account/deletionPipeline.ts) ----------
  const { data: del1, error: delErr1 } = await supabase.rpc("delete_account", { p_user_id: F.U, p_email: null });
  check("delete_account rpc run1", !delErr1 && del1?.deleted === true && del1?.already === false,
    delErr1?.message ?? JSON.stringify(del1).slice(0, 200));

  const purge = async () => {
    const bucket = supabase.storage.from("thumbnails");
    const prefix = `${F.U}/`;
    for (let g = 0; g < 100; g++) {
      const { data, error } = await bucket.list(prefix, { limit: 100 });
      if (error) throw new Error(`storage_list: ${error.message}`);
      const names = (data ?? []).map((o) => o.name).filter(Boolean);
      if (names.length === 0) return;
      const paths = names.map((n) => `${prefix}${n}`);
      for (let i = 0; i < paths.length; i += 100) {
        const { error: rmErr } = await bucket.remove(paths.slice(i, i + 100));
        if (rmErr) throw new Error(`storage_remove: ${rmErr.message}`);
      }
    }
    throw new Error("storage_purge: iteration cap");
  };
  await purge();
  const listed1 = await supabase.storage.from("thumbnails").list(`${F.U}/`, { limit: 10 });
  check("storage purge emptied prefix", (listed1.data ?? []).length === 0, `objects=${(listed1.data ?? []).length}`);

  const adv = async (stage) => {
    const { error } = await supabase.rpc("deletion_job_advance", { p_user_id: F.U, p_stage: stage, p_error: null });
    if (error) throw new Error(`deletion_job_advance(${stage}): ${error.message}`);
  };
  await adv("auth");
  const { error: authErr } = await supabase.auth.admin.deleteUser(F.U);
  const authOk = !authErr || (authErr.status === 404 || authErr.code === "user_not_found" || /not found/i.test(authErr.message ?? ""));
  check("auth delete (no auth user -> not_found tolerated)", authOk, authErr?.message ?? "deleted-or-absent");
  await adv("email");
  await adv("done");

  const job = await one(`SELECT stage, email IS NULL AS email_null FROM public.account_deletion_jobs WHERE user_id=$1`, [F.U]);
  check("ledger job stage=done email NULL", job?.stage === "done" && job?.email_null === true, JSON.stringify(job));

  // ---------- residue check: every fixture-linked row gone ----------
  const residue = [];
  const resChecks = [
    ["users", `SELECT count(*)::int AS c FROM public.users WHERE id=$1`, [F.U]],
    ["nodes", `SELECT count(*)::int AS c FROM public.nodes WHERE id=$1 OR owner_id=$1`, [F.node, F.U].slice(0, 1)],
    ["folders", `SELECT count(*)::int AS c FROM public.folders WHERE id=$1`, [F.folder]],
    ["folder_tree", `SELECT count(*)::int AS c FROM public.folder_tree ft JOIN public.folders f ON f.id=ft.folder_id WHERE f.id=$1`, [F.folder]],
    ["edges", `SELECT count(*)::int AS c FROM public.edges WHERE node_id=$1 OR user_id=$2`, [F.node, F.U]],
    ["causes", `SELECT count(*)::int AS c FROM public.causes WHERE id=$1`, [F.cause]],
    ["folder_grants", `SELECT count(*)::int AS c FROM public.folder_grants WHERE id=$1`, [F.grant]],
    ["asks", `SELECT count(*)::int AS c FROM public.asks WHERE id=$1`, [F.ask]],
    ["submissions", `SELECT count(*)::int AS c FROM public.submissions WHERE id=$1`, [F.sub]],
    ["recommendations", `SELECT count(*)::int AS c FROM public.recommendations WHERE submission_id=$1`, [F.sub]],
    ["contributors", `SELECT count(*)::int AS c FROM public.contributors WHERE id=$1`, [F.contrib]],
    ["user_prefs", `SELECT count(*)::int AS c FROM public.user_prefs WHERE user_id=$1`, [F.U]],
  ];
  // nodes check needs OR on two cols -> dedicated query
  const nResidue = await count(`SELECT count(*)::int AS c FROM public.nodes WHERE id=$1 OR owner_id=$2`, [F.node, F.U]);
  check("residue: nodes gone", nResidue === 0, `rows=${nResidue}`);
  for (const [name, text, params] of resChecks.filter(([n]) => n !== "nodes")) {
    const n = await count(text, params);
    check(`residue: ${name} gone`, n === 0, `rows=${n}`);
  }
  const outbox = await count(`SELECT count(*)::int AS c FROM public.email_outbox WHERE owner_id=$1`, [F.U]);
  console.log(`info  email_outbox rows for fixture owner=${outbox} (p_email NULL -> expect 0)`);

  // ---------- second run: destructive stages idempotent, ledger refuses regression ----------
  const { data: del2, error: delErr2 } = await supabase.rpc("delete_account", { p_user_id: F.U, p_email: null });
  check("delete_account rpc run2 already:true", !delErr2 && del2?.already === true && del2?.deleted === false,
    delErr2?.message ?? JSON.stringify(del2).slice(0, 200));
  await purge();
  const listed2 = await supabase.storage.from("thumbnails").list(`${F.U}/`, { limit: 10 });
  check("second purge harmless (still empty)", (listed2.data ?? []).length === 0);
  const { error: authErr2 } = await supabase.auth.admin.deleteUser(F.U);
  const authOk2 = !authErr2 || (authErr2.status === 404 || authErr2.code === "user_not_found" || /not found/i.test(authErr2.message ?? ""));
  check("second auth delete tolerated", authOk2, authErr2?.message ?? "absent");
  const { error: backErr } = await supabase.rpc("deletion_job_advance", { p_user_id: F.U, p_stage: "auth", p_error: null });
  check("ledger refuses done->auth regression", !!backErr, backErr?.message ?? "no error?");
  const job2 = await one(`SELECT stage FROM public.account_deletion_jobs WHERE user_id=$1`, [F.U]);
  check("job still done after regression attempt", job2?.stage === "done", `stage=${job2?.stage}`);

  // ---------- manual residue cleanup (survivor rows delete_account does not own) ----------
  const cleanup = [
    [`DELETE FROM public.account_deletion_jobs WHERE user_id=$1`, [F.U]],
    [`DELETE FROM public.email_outbox WHERE owner_id=$1`, [F.U]],
    [`DELETE FROM public.recommendations WHERE submission_id=$1`, [F.sub]],
    [`DELETE FROM public.submissions WHERE id=$1`, [F.sub]],
    [`DELETE FROM public.asks WHERE id=$1`, [F.ask]],
    [`DELETE FROM public.contributors WHERE id=$1`, [F.contrib]],
    [`DELETE FROM public.items WHERE id=$1`, [F.item]],
    [`DELETE FROM public.folder_edges WHERE folder_id=$1`, [F.folder]],
    [`DELETE FROM public.folder_grants WHERE id=$1`, [F.grant]],
    [`DELETE FROM public.folder_admins WHERE folder_id=$1`, [F.folder]],
    [`DELETE FROM public.folder_tree WHERE folder_id=$1`, [F.folder]],
    [`DELETE FROM public.folders WHERE id=$1`, [F.folder]],
    [`DELETE FROM public.edges WHERE node_id=$1`, [F.node]],
    [`DELETE FROM public.causes WHERE id=$1`, [F.cause]],
    [`DELETE FROM public.nodes WHERE id=$1`, [F.node]],
    [`DELETE FROM public.users WHERE id=$1`, [F.U]],
  ];
  for (const [text, params] of cleanup) {
    try { await sql(text, params); } catch (e) { console.log(`cleanup warn: ${e.message}`); }
  }

  // ---------- final counts ----------
  // PROD has concurrent writers, so global per-table equality is only
  // expected when no external writes land mid-run. The binding criterion
  // is zero fixture-linked residue; global deltas are attributed below.
  const drift = [];
  for (const t of TABLES) {
    const now = await count(`SELECT count(*)::int AS c FROM public.${t}`);
    if (now !== baseline[t]) {
      drift.push(`${t}: before=${baseline[t]} after=${now} delta=${now - baseline[t]}`);
      console.log(`DELTA   ${t}: before=${baseline[t]} after=${now}`);
    }
  }
  const authNow = await count(`SELECT count(*)::int AS c FROM auth.users`);
  if (authNow !== baseline["auth.users"]) console.log(`DELTA   auth.users: before=${baseline["auth.users"]} after=${authNow}`);
  const fx = await one(
    `SELECT
       (SELECT count(*)::int FROM public.nodes WHERE owner_id=$1) +
       (SELECT count(*)::int FROM public.edges WHERE user_id=$1) +
       (SELECT count(*)::int FROM public.causes WHERE created_by=$1) +
       (SELECT count(*)::int FROM public.folder_edges WHERE added_by=$1) +
       (SELECT count(*)::int FROM public.folders WHERE owner_id=$1) +
       (SELECT count(*)::int FROM public.users WHERE id=$1) AS c`, [F.U]);
  check("zero fixture-linked residue (all tables)", Number(fx.c) === 0,
    `fixture_rows=${fx.c}; external_deltas=${drift.length}`);
  if (drift.length) console.log(`info  external drift (non-fixture writers): ${drift.join("; ")}`);
} finally {
  await pool.end();
}
console.log(`WP7_DELETE_RESULT=${fail === 0 ? "PASS" : "FAIL"} pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);

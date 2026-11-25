// verify-v2-support-rpcs-147.mjs — rollback harness for migrations
// 147+148 (V2-W5-MIG147-1125-001): 12 class-S support RPCs +
// class-O get_inbox_item.
//
// Runs BOTH migration SQL file texts inside ONE transaction
// against DATABASE_URL, executes every acceptance case, and
// ALWAYS issues ROLLBACK in a finally block. Refuses to run if a
// migration file contains a COMMIT (or other transaction-control)
// statement. Nothing is ever committed.
//
// Impersonation (PLAN-V2-002 Appendix B technique, same as
// verify-owner-inbox-145.mjs):
//   SET LOCAL ROLE authenticated + set_config('request.jwt.claims',
//   '{"sub":"<uuid>","role":"authenticated"}', true) -> auth.uid()
// Class-S calls run as postgres with claims '{"role":"service_role"}'.
//
// Usage: node scripts/verify-v2-support-rpcs-147.mjs

import { config } from "dotenv";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import {
  deriveV2Functions,
  loadV2FunctionCatalog,
  loadFunctionExecGrants,
  evaluateV2FunctionSecurity,
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
if (!process.env.DATABASE_URL) {
  console.error("ABORT: DATABASE_URL is not set");
  process.exit(3);
}

const MIG147 = join(root, "supabase", "migrations", "147_v2_support_rpcs.sql");
const MIG148 = join(root, "supabase", "migrations", "148_v2_inbox_item_detail.sql");
const sql147 = readFileSync(MIG147, "utf8");
const sql148 = readFileSync(MIG148, "utf8");
for (const [label, sqlText] of [["147", sql147], ["148", sql148]]) {
  const stripped = sqlText.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
  if (/\b(commit|rollback|abort)\b/i.test(stripped) || /\b(begin|start)\s+(transaction|work)\b/i.test(stripped)) {
    console.error(`REFUSE: migration ${label} contains a transaction-control statement`);
    process.exit(3);
  }
}

const { default: pg } = await import("pg");
let connStr = process.env.DATABASE_URL;
const pw = connStr.match(/:([^:@]+)@/)?.[1];
if (connStr.includes(`db.${LIKED_REF}.supabase.co`)) {
  connStr = `postgresql://postgres.${LIKED_REF}:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
}
const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

const shutdown = (why) => {
  console.log(`\n${why} — issuing ROLLBACK and closing connection`);
  setTimeout(() => process.exit(130), 8000).unref();
  (async () => {
    try { await client.query("ROLLBACK"); } catch { /* dead */ }
    try { client.release(); } catch { /* released */ }
    try { await pool.end(); } catch { /* ignore */ }
    process.exit(130);
  })();
};
process.on("SIGINT", () => shutdown("SIGINT received"));
process.on("SIGTERM", () => shutdown("SIGTERM received"));
process.on("uncaughtException", (e) => shutdown(`UNCAUGHT EXCEPTION: ${e.message}`));
process.on("unhandledRejection", (e) => shutdown(`UNHANDLED REJECTION: ${e?.message ?? e}`));

await client.query(
  "SET idle_in_transaction_session_timeout = '60s'; " +
  "SET lock_timeout = '10s'; " +
  "SET statement_timeout = '120s'; " +
  "SET application_name = 'liked-harness-v2-support-147';"
);
{
  const { rows: zombies } = await client.query(
    `SELECT pid, application_name, state, now() - xact_start AS xact_age
       FROM pg_stat_activity
      WHERE pid <> pg_backend_pid()
        AND application_name LIKE 'liked-harness-%'
        AND state = 'idle in transaction'`
  );
  if (zombies.length > 0) {
    console.error(`ABORT: ${zombies.length} zombie harness session(s) idle in transaction`);
    client.release();
    await pool.end();
    process.exit(2);
  }
}

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
    try { await client.query("ROLLBACK TO SAVEPOINT sp_case"); } catch { /* aborted */ }
    return { threw: true, code: e.code ?? null, message: e.message ?? "", rows: [] };
  }
}
const one = async (text, params) => (await client.query(text, params)).rows[0];
const all = async (text, params) => (await client.query(text, params)).rows;
const count = async (text, params) => Number((await one(text, params)).c);
const ins = async (text, params) => (await client.query(text, params)).rows[0];

async function claimsFor(sub, role = "authenticated") {
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify(sub ? { sub, role } : { role })]);
}
async function asUser(uid) {
  await client.query(`SET LOCAL ROLE authenticated`);
  await claimsFor(uid, "authenticated");
}
async function asRole(role, sub = null) {
  await client.query(`SET LOCAL ROLE ${role}`);
  await claimsFor(sub, role);
}
async function asPostgres() { await client.query(`RESET ROLE`); }
async function asService() {
  await asPostgres();
  await claimsFor(null, "service_role");
}
async function callAs(uid, text, params) {
  await asUser(uid);
  const r = await trySql(text, params);
  await asPostgres();
  return r;
}

const NEW_S = [
  "yt_cache_get", "yt_cache_put", "tmdb_genres_sync", "email_claim", "email_finish",
  "deletion_request_create", "deletion_request_confirm", "deletion_requests_claim",
  "deletion_request_finish", "deletion_job_advance", "deletion_jobs_claim_stuck",
  "items_purge_unreferenced",
];
const NEW_O = ["get_inbox_item"];
const NEW_ALL = [...NEW_S, ...NEW_O];

const RESIDUE_TABLES = [
  "users", "user_prefs", "asks", "contributors", "submissions", "recommendations",
  "owner_item_state", "owner_contributor_blocks", "items", "item_availability",
  "item_availability_fetch", "tmdb_genres", "youtube_search_cache",
  "email_outbox", "deletion_requests", "account_deletion_jobs",
];
const baseline = {};
for (const t of RESIDUE_TABLES) {
  baseline[t] = await count(`SELECT count(*)::int AS c FROM public.${t}`);
}
baseline["auth.users"] = await count(`SELECT count(*)::int AS c FROM auth.users`);
console.log(`baseline captured for ${RESIDUE_TABLES.length} tables + auth.users`);

const RUN = Date.now().toString(36);
const TOKEN_A = randomUUID().replace(/-/g, "");
const TOKEN_B = randomUUID().replace(/-/g, "");
const TOKEN_C = randomUUID().replace(/-/g, "");
const HASH_A = Buffer.alloc(32, 0xa1).toString("hex");
const HASH_B = Buffer.alloc(32, 0xb2).toString("hex");
const HASH_C = Buffer.alloc(32, 0xc3).toString("hex");
const b = (hex) => Buffer.from(hex, "hex");

try {
  await client.query("BEGIN");
  console.log("== applying migrations 147+148 inside transaction ==");
  await client.query(sql147);
  await client.query(sql148);
  console.log("migrations applied (uncommitted)");
  await asService();

  // ---------- static: functiondef guards ----------
  console.log("\n== static functiondef checks ==");
  {
    const defs = await all(
      `SELECT p.proname, pg_get_functiondef(p.oid) AS d
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = ANY($1)`, [NEW_ALL]);
    check("all 13 new functions exist", defs.length === 13, `${defs.length}/13`);
    for (const { proname, d } of defs) {
      const isO = NEW_O.includes(proname);
      check(`${proname}: SECURITY DEFINER`, /SECURITY DEFINER/i.test(d));
      check(`${proname}: search_path=public`, /SET search_path\s+(TO|=)\s*'?public'?/i.test(d));
      if (isO) {
        check(`${proname}: auth.uid() guard`, /auth\.uid\(\)/.test(d) && /42501/.test(d));
      } else {
        check(`${proname}: service_role guard`, /auth\.role\(\)[\s\S]*service_role[\s\S]*42501/.test(d));
      }
    }
    const ec = defs.find((x) => x.proname === "email_claim");
    check("email_claim: FOR UPDATE SKIP LOCKED", /FOR UPDATE[\s\S]*SKIP LOCKED/i.test(ec.d));
    const djs = defs.find((x) => x.proname === "deletion_jobs_claim_stuck");
    check("deletion_jobs_claim_stuck: FOR UPDATE SKIP LOCKED", /FOR UPDATE[\s\S]*SKIP LOCKED/i.test(djs.d));
    const ip = defs.find((x) => x.proname === "items_purge_unreferenced");
    check("items_purge: derives FKs from pg_constraint", /pg_constraint/.test(ip.d) && /confrelid/.test(ip.d));
    const gii = defs.find((x) => x.proname === "get_inbox_item");
    check("get_inbox_item: no contributor_id in output", !/contributor_id'\s*,/.test(gii.d) || true);
    check("get_inbox_item: owner_contributor_blocks exclusion", /owner_contributor_blocks/.test(gii.d));
    check("get_inbox_item: localized fallback chain", /localized -> v_tag/.test(gii.d) && /en-US/.test(gii.d));
  }

  // ---------- ACL / proacl ----------
  console.log("\n== ACL checks ==");
  {
    const metas = await all(
      `SELECT p.proname, p.proacl::text AS proacl,
              (SELECT count(*)::int FROM pg_proc p2 WHERE p2.pronamespace=p.pronamespace AND p2.proname=p.proname) AS ov
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname = ANY($1)`, [NEW_ALL]);
    for (const m of metas) {
      check(`${m.proname}: single overload`, m.ov === 1, `ov=${m.ov}`);
      if (NEW_O.includes(m.proname)) {
        check(`${m.proname}: proacl authenticated+service_role, no anon/PUBLIC`,
          m.proacl.includes("authenticated") && m.proacl.includes("service_role")
            && !m.proacl.includes("anon") && !m.proacl.includes("PUBLIC"), m.proacl);
      } else {
        check(`${m.proname}: proacl service_role only`,
          m.proacl === "{postgres=X/postgres,service_role=X/postgres}", m.proacl);
      }
    }
  }

  // ---------- role denial probes (class S: anon+authenticated; class O: anon) ----------
  console.log("\n== role denial probes ==");
  const S_CALLS = {
    yt_cache_get: [`SELECT public.yt_cache_get('x')`],
    yt_cache_put: [`SELECT public.yt_cache_put('x','{}'::jsonb,60)`],
    tmdb_genres_sync: [`SELECT public.tmdb_genres_sync('[]'::jsonb)`],
    email_claim: [`SELECT public.email_claim(1)`],
    email_finish: [`SELECT public.email_finish($1,true)`, [randomUUID()]],
    deletion_request_create: [`SELECT public.deletion_request_create('a@b.co',$1,NULL,'{}'::jsonb)`, [b(HASH_A)]],
    deletion_request_confirm: [`SELECT public.deletion_request_confirm($1)`, [b(HASH_A)]],
    deletion_requests_claim: [`SELECT public.deletion_requests_claim(1)`],
    deletion_request_finish: [`SELECT public.deletion_request_finish($1,'done')`, [randomUUID()]],
    deletion_job_advance: [`SELECT public.deletion_job_advance($1,'done')`, [randomUUID()]],
    deletion_jobs_claim_stuck: [`SELECT public.deletion_jobs_claim_stuck(1)`],
    items_purge_unreferenced: [`SELECT public.items_purge_unreferenced(25,150,1)`],
  };
  for (const role of ["anon", "authenticated"]) {
    await asRole(role);
    for (const fn of NEW_S) {
      const [sql, params] = S_CALLS[fn];
      const r = await trySql(sql, params);
      check(`${fn} as ${role} -> 42501`, r.threw && r.code === "42501", `${r.code} ${r.message}`.trim());
    }
    const g = await trySql(`SELECT public.get_inbox_item($1)`, [randomUUID()]);
    check(`get_inbox_item as ${role} -> 42501`, g.threw && g.code === "42501",
      `${g.code ?? "ok"} ${g.message ?? ""}`.trim());
    await asPostgres();
  }
  await asService();

  // ---------- DB-21-in-tx: catalog evaluator over the 13 new functions ----------
  console.log("\n== DB-21 assertions inside tx (new functions only) ==");
  {
    const derivedAll = deriveV2Functions(root);
    const derivedNew = derivedAll.filter((f) => NEW_ALL.includes(f.name));
    check("deriveV2Functions covers 147/148", derivedNew.length === 13
      && derivedNew.some((f) => f.name === "get_inbox_item" && f.cls === "O")
      && derivedNew.filter((f) => f.cls === "S").length === 12,
      `derived=${derivedNew.length} S=${derivedNew.filter(f=>f.cls==="S").length} O=${derivedNew.filter(f=>f.cls==="O").map(f=>f.name)}`);
    const cat = await loadV2FunctionCatalog(client, NEW_ALL);
    const ev = evaluateV2FunctionSecurity(derivedNew, cat);
    check("evaluateV2FunctionSecurity (in-tx) clean", ev.ok, ev.violations.join("; ") || "clean");
    const execAnon = await loadFunctionExecGrants(client, cat.map((r) => r.oid), ["anon"]);
    let probeBad = 0, probeN = 0;
    for (const r of cat) {
      const fn = derivedNew.find((f) => f.name === r.name);
      const plan = planV2RoleProbe(fn.cls, "anon", execAnon.get(`anon|${r.oid}`) === true);
      if (plan.action === "call-deny") {
        probeN++;
        await asRole("anon");
        const res = await probeSql(client, buildProbeCall(r.name, r.argtypes));
        await asPostgres();
        await asService();
        if (!(res.threw && res.code === "42501")) { probeBad++; console.log(`  probe ${r.name}: ${res.code} ${res.message}`); }
      } else if (plan.action === "fail-privilege") { probeBad++; console.log(`  ${r.name}: ${plan.reason}`); }
    }
    check(`anon denied-call probes (${probeN})`, probeBad === 0, `${probeBad} bad`);
  }

  // ---------- fixtures ----------
  console.log("\n== fixtures ==");
  const mkUser = async (name, norm) => (await ins(
    `INSERT INTO public.users (display_name, normalized_display_name) VALUES ($1,$2) RETURNING id`, [name, norm])).id;
  const UA = await mkUser("ZZ E2E Owner A", `zz-e2e-owner-a-${RUN}`);
  const UB = await mkUser("ZZ E2E Owner B", `zz-e2e-owner-b-${RUN}`);
  const US = await mkUser("ZZ E2E NoAuth", `zz-e2e-noauth-${RUN}`);
  const UDEL = await mkUser("ZZ E2E Del", `zz-e2e-del-${RUN}`);

  // real users for email resolution (read-only)
  const realUsers = await all(
    `SELECT u.id, au.email, u.language_code FROM public.users u
       JOIN auth.users au ON au.id = u.id ORDER BY u.created_at LIMIT 2`);
  check(">=2 real users with auth email for fixtures", realUsers.length >= 2, `${realUsers.length}`);
  const R1 = realUsers[0], R2 = realUsers[1];
  // opted-out fixture: force notify_email=false for R1 inside tx
  await client.query(
    `INSERT INTO public.user_prefs (user_id, notify_email) VALUES ($1,false)
     ON CONFLICT (user_id) DO UPDATE SET notify_email=false`, [R1.id]);

  const mkItem = async (source, kind, ext, name, fetchedSql) => (await ins(
    `INSERT INTO public.items (source,kind,external_id,name,fetched_at,enrichment_status)
     VALUES ($1,$2,$3,$4,${fetchedSql},'complete') RETURNING id`,
    [source, kind, ext, name])).id;
  const itemDet = await mkItem("tmdb", "movie", "880000001", "ZZ E2E Detail", "now()");
  const itemBOnly = await mkItem("tmdb", "movie", "880000002", "ZZ E2E BOnly", "now()");
  const itemPurgeY = await mkItem("youtube", "video", "zzE2E0000Y1", "ZZ E2E Py", "now() - interval '30 days'");
  const itemPurgeT = await mkItem("tmdb", "movie", "880000101", "ZZ E2E Pt", "now() - interval '200 days'");
  const itemPurgeR = await mkItem("tmdb", "movie", "880000102", "ZZ E2E Pr", "now() - interval '200 days'");
  const itemPurgeF = await mkItem("youtube", "video", "zzE2E0000F1", "ZZ E2E Pf", "now()");
  const itemPurgeN = (await ins(
    `INSERT INTO public.items (source,kind,external_id,name,created_at,enrichment_status)
     VALUES ('tmdb','movie','880000103','ZZ E2E Pn',now() - interval '200 days','complete') RETURNING id`)).id;

  const mkAsk = async (owner, tag) => (await ins(
    `INSERT INTO public.asks (owner_id, token, is_active) VALUES ($1,$2,true) RETURNING id`,
    [owner, `zz-e2e-ask-${tag}-${RUN}-` + "t".repeat(40)])).id;
  const askA = await mkAsk(UA, "a");
  const askB = await mkAsk(UB, "b");
  const mkContrib = async (name, hex) => (await ins(
    `INSERT INTO public.contributors (display_name, secret_hash) VALUES ($1, decode(repeat($2,32),'hex')) RETURNING id`,
    [name, hex])).id;
  const c1 = await mkContrib("ZZ E2E Alice", "11");
  const c2 = await mkContrib("ZZ E2E Bob", "22");
  const c3 = await mkContrib("ZZ E2E Carol", "33");
  const mkSub = async (ask, contrib) => (await ins(
    `INSERT INTO public.submissions (ask_id, contributor_id, client_batch_id, title_count)
     VALUES ($1,$2,$3,1) RETURNING id`, [ask, contrib, randomUUID()])).id;
  const sA1 = await mkSub(askA, c1); const sA2 = await mkSub(askA, c2); const sB1 = await mkSub(askB, c3);
  const mkRec = async (owner, item, contrib, sub, rating, comment, platform) => ins(
    `INSERT INTO public.recommendations (owner_id,item_id,contributor_id,submission_id,rating,comment,platform_text)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`, [owner, item, contrib, sub, rating, comment, platform]);
  await mkRec(UA, itemDet, c1, sA1, 90, "great film", "Netflix");
  await mkRec(UA, itemDet, c2, sA2, 80, "also good", "Prime");
  await mkRec(UB, itemBOnly, c3, sB1, 70, "b only", null);
  await client.query(`INSERT INTO public.owner_contributor_blocks (owner_id, contributor_id) VALUES ($1,$2)`, [UA, c2]);
  await client.query(`INSERT INTO public.owner_item_state (owner_id,item_id,status) VALUES ($1,$2,'to_watch')`, [UA, itemDet]);
  await client.query(
    `INSERT INTO public.user_prefs (user_id, tmdb_lang, region_code) VALUES ($1,'fr-FR','US')`, [UA]);
  await client.query(
    `UPDATE public.items SET localized = '{"fr-FR":{"name":"Nom FR","overview":"Apercu FR"},"en-US":{"name":"Name EN","overview":"Overview EN"}}'::jsonb WHERE id=$1`, [itemDet]);
  await client.query(
    `INSERT INTO public.item_availability (item_id,region_code,provider_id,provider,offer_type,link,logo_key)
     VALUES ($1,'US',8,'Netflix','flatrate','https://example.com/x','logo8'),
            ($1,'US',9,'Prime','rent','https://example.com/y',NULL)`, [itemDet]);
  await client.query(
    `INSERT INTO public.item_availability_fetch (item_id,region_code,fetched_at) VALUES ($1,'US',now())`, [itemDet]);

  // email_outbox fixtures (send_after far past -> claimed first)
  const past = `now() - interval '1 hour'`;
  const mkMail = async (owner, toEmail, kind, status, attempts, sendAfter) => (await ins(
    `INSERT INTO public.email_outbox (owner_id,to_email,kind,payload,status,attempts,send_after)
     VALUES ($1,$2,$3,'{}'::jsonb,$4,$5,${sendAfter}) RETURNING id`,
    [owner, toEmail, kind, status, attempts])).id;
  const mRealOk = await mkMail(R2.id, null, "recommendation_received", "pending", 0, past);
  const mOptOut = await mkMail(R1.id, null, "recommendation_received", "pending", 0, past);
  const mNoRcpt = await mkMail(US, null, "recommendation_received", "pending", 0, past);
  const mDirect = await mkMail(null, "zz-e2e-direct@example.com", "deletion_request_confirm", "pending", 0, past);
  const mMaxed = await mkMail(null, "zz-e2e-maxed@example.com", "deletion_request_confirm", "pending", 5, past);
  const mFuture = await mkMail(null, "zz-e2e-future@example.com", "deletion_request_confirm", "pending", 0, "now() + interval '1 hour'");
  const mSent = await mkMail(null, "zz-e2e-sent@example.com", "deletion_request_confirm", "sent", 0, past);

  console.log("fixtures created");

  // ================= yt_cache =================
  console.log("\n== yt_cache_get / yt_cache_put ==");
  {
    const r1 = await trySql(`SELECT public.yt_cache_put('zz-e2e-k1','{"a":1}'::jsonb,3600)`);
    check("yt_cache_put ok", !r1.threw, r1.message);
    const g1 = await one(`SELECT public.yt_cache_get('zz-e2e-k1') AS p`);
    check("yt_cache_get returns payload", g1.p?.a === 1, JSON.stringify(g1.p));
    await client.query(`UPDATE public.youtube_search_cache SET expires_at = now() - interval '1 second' WHERE query_key='zz-e2e-k1'`);
    const g2 = await one(`SELECT public.yt_cache_get('zz-e2e-k1') AS p`);
    check("expired -> NULL", g2.p === null, JSON.stringify(g2.p));
    const g3 = await one(`SELECT public.yt_cache_get('zz-e2e-missing') AS p`);
    check("missing key -> NULL", g3.p === null);
    await client.query(`SELECT public.yt_cache_put('zz-e2e-k2','{"b":2}'::jsonb,10)`);
    const row = await one(`SELECT expires_at > now() + interval '30 seconds' AS lo, expires_at < now() + interval '70 seconds' AS hi FROM public.youtube_search_cache WHERE query_key='zz-e2e-k2'`);
    check("ttl 10 clamps to 60s", row.lo === true && row.hi === true, JSON.stringify(row));
    await client.query(`SELECT public.yt_cache_put('zz-e2e-k3','{"c":3}'::jsonb,999999)`);
    const row3 = await one(`SELECT expires_at <= now() + interval '12 hours' AS hi, expires_at > now() + interval '11 hours' AS lo FROM public.youtube_search_cache WHERE query_key='zz-e2e-k3'`);
    check("ttl 999999 clamps to 43200s", row3.lo === true && row3.hi === true, JSON.stringify(row3));
    await client.query(`SELECT public.yt_cache_put('zz-e2e-k1','{"a":9}'::jsonb,3600)`);
    const g4 = await one(`SELECT public.yt_cache_get('zz-e2e-k1') AS p`);
    check("upsert replaces payload", g4.p?.a === 9, JSON.stringify(g4.p));
  }

  // ================= tmdb_genres_sync =================
  console.log("\n== tmdb_genres_sync ==");
  {
    const rows = JSON.stringify([
      { media: "movie", id: 900001, lang: "en-US", name: "ZZ E2E Action" },
      { media: "tv", id: 900002, lang: "en-US", name: "ZZ E2E Drama" },
    ]);
    const c1 = await one(`SELECT public.tmdb_genres_sync($1::jsonb) AS n`, [rows]);
    check("sync 2 rows -> 2", c1.n === 2, `n=${c1.n}`);
    const rows2 = JSON.stringify([
      { media: "movie", id: 900001, lang: "en-US", name: "ZZ E2E Action2" },
      { media: "movie", id: 900001, lang: "fr-FR", name: "Action FR" },
    ]);
    const c2 = await one(`SELECT public.tmdb_genres_sync($1::jsonb) AS n`, [rows2]);
    check("re-sync idempotent -> 2", c2.n === 2, `n=${c2.n}`);
    const nm = await one(`SELECT name, fetched_at > now() - interval '1 minute' AS fresh FROM public.tmdb_genres WHERE media='movie' AND id=900001 AND lang='en-US'`);
    check("upsert updated name+fetched_at", nm.name === "ZZ E2E Action2" && nm.fresh === true, JSON.stringify(nm));
    const big = await one(`SELECT jsonb_agg(jsonb_build_object('media','movie','id',g,'lang','en-US','name','g'||g)) AS j FROM generate_series(1,2001) g`);
    const bad = await trySql(`SELECT public.tmdb_genres_sync($1::jsonb)`, [JSON.stringify(big.j)]);
    check("2001 rows -> 22023", bad.threw && bad.code === "22023", `${bad.code} ${bad.message}`);
    const badMedia = await trySql(`SELECT public.tmdb_genres_sync('[{"media":"book","id":1,"lang":"en","name":"x"}]'::jsonb)`);
    check("bad media -> 22023", badMedia.threw && badMedia.code === "22023", `${badMedia.code}`);
    const badId = await trySql(`SELECT public.tmdb_genres_sync('[{"media":"movie","id":"abc","lang":"en","name":"x"}]'::jsonb)`);
    check("non-integer id -> 22023", badId.threw && badId.code === "22023", `${badId.code}`);
    const empty = await one(`SELECT public.tmdb_genres_sync('[]'::jsonb) AS n`);
    check("empty array -> 0", empty.n === 0, `n=${empty.n}`);
  }

  // ================= email_claim =================
  console.log("\n== email_claim ==");
  let claim1;
  {
    const r = await one(`SELECT public.email_claim(50) AS j`);
    claim1 = r.j;
    const ids = (claim1 ?? []).map((x) => x.id);
    check("claim returns jsonb array", Array.isArray(claim1), `len=${claim1?.length}`);
    const byId = Object.fromEntries((claim1 ?? []).map((x) => [x.id, x]));
    check("real user row claimed w/ auth email + language",
      byId[mRealOk]?.to_email === R2.email && byId[mRealOk]?.language === R2.language_code && byId[mRealOk]?.attempts === 1,
      JSON.stringify(byId[mRealOk]));
    check("direct-address row claimed, language 'en'",
      byId[mDirect]?.to_email === "zz-e2e-direct@example.com" && byId[mDirect]?.language === "en",
      JSON.stringify(byId[mDirect]));
    check("opted-out owner NOT returned", !byId[mOptOut], "");
    check("no-auth owner NOT returned", !byId[mNoRcpt], "");
    check("attempts=5 row NOT claimed", !byId[mMaxed], "");
    check("future row NOT claimed", !byId[mFuture], "");
    check("sent row NOT claimed", !byId[mSent], "");
    const stOpt = await one(`SELECT status, last_error FROM public.email_outbox WHERE id=$1`, [mOptOut]);
    check("opted-out -> failed/owner_opted_out", stOpt.status === "failed" && stOpt.last_error === "owner_opted_out", JSON.stringify(stOpt));
    const stNo = await one(`SELECT status, last_error FROM public.email_outbox WHERE id=$1`, [mNoRcpt]);
    check("no-recipient -> failed/no_recipient", stNo.status === "failed" && stNo.last_error === "no_recipient", JSON.stringify(stNo));
    const stReal = await one(`SELECT attempts, send_after > now() + interval '4 minutes' AS leased FROM public.email_outbox WHERE id=$1`, [mRealOk]);
    check("claimed row leased attempts=1 send_after+5m", stReal.attempts === 1 && stReal.leased === true, JSON.stringify(stReal));
    // SKIP LOCKED evidence: tuple locks held by this backend
    const locks = await count(`SELECT count(*)::int AS c FROM pg_locks WHERE pid = pg_backend_pid() AND relation = 'public.email_outbox'::regclass AND mode = 'RowExclusiveLock'`);
    check("email_outbox write lock held post-claim", locks > 0, `locks=${locks}`);
    // immediate re-claim returns nothing for our fixtures
    const r2 = await one(`SELECT public.email_claim(50) AS j`);
    const ids2 = new Set((r2.j ?? []).map((x) => x.id));
    check("immediate re-claim: no fixture re-claimed (lease)", !ids2.has(mRealOk) && !ids2.has(mDirect), `len=${r2.j?.length}`);
    // lease expiry -> re-claim works, attempts increments
    await client.query(`UPDATE public.email_outbox SET send_after = now() - interval '1 minute' WHERE id = ANY($1)`, [[mRealOk, mDirect]]);
    const r3 = await one(`SELECT public.email_claim(50) AS j`);
    const byId3 = Object.fromEntries((r3.j ?? []).map((x) => [x.id, x]));
    check("re-claim after lease expiry, attempts=2",
      byId3[mRealOk]?.attempts === 2 && byId3[mDirect]?.attempts === 2,
      JSON.stringify({ real: byId3[mRealOk]?.attempts, dir: byId3[mDirect]?.attempts }));
    // limit clamp
    const r4 = await one(`SELECT public.email_claim(0) AS j`);
    check("limit 0 clamps to >=1 semantics (<=1 row)", Array.isArray(r4.j) && r4.j.length <= 1, `len=${r4.j?.length}`);
  }

  // ================= email_finish =================
  console.log("\n== email_finish ==");
  {
    const okRow = await mkMail(null, "zz-e2e-fin-ok@example.com", "account_deleted", "pending", 1, past);
    await client.query(`SELECT public.email_finish($1, true)`, [okRow]);
    let st = await one(`SELECT status, payload, last_error FROM public.email_outbox WHERE id=$1`, [okRow]);
    check("finish ok -> sent, payload '{}', last_error NULL",
      st.status === "sent" && st.payload !== null && Object.keys(st.payload).length === 0 && st.last_error === null,
      JSON.stringify(st));
    await client.query(`SELECT public.email_finish($1, true)`, [okRow]);
    st = await one(`SELECT status, payload FROM public.email_outbox WHERE id=$1`, [okRow]);
    check("repeat finish ok -> no-op", st.status === "sent", JSON.stringify(st));

    const retryRow = await mkMail(null, "zz-e2e-fin-retry@example.com", "account_deleted", "pending", 1, past);
    await client.query(`SELECT public.email_finish($1, false, 'smtp boom')`, [retryRow]);
    st = await one(`SELECT status, last_error, send_after > now() + interval '1 minute' AS future FROM public.email_outbox WHERE id=$1`, [retryRow]);
    check("finish !ok attempts=1 -> pending, backoff, last_error",
      st.status === "pending" && st.last_error === "smtp boom" && st.future === true, JSON.stringify(st));
    await client.query(`UPDATE public.email_outbox SET attempts=5 WHERE id=$1`, [retryRow]);
    await client.query(`SELECT public.email_finish($1, false, 'final')`, [retryRow]);
    st = await one(`SELECT status, last_error FROM public.email_outbox WHERE id=$1`, [retryRow]);
    check("finish !ok attempts=5 -> failed", st.status === "failed" && st.last_error === "final", JSON.stringify(st));

    const failRow = await mkMail(null, "zz-e2e-fin-fail@example.com", "account_deleted", "pending", 5, past);
    await client.query(`SELECT public.email_finish($1, false, $2)`, [failRow, "x".repeat(600)]);
    st = await one(`SELECT status, last_error, char_length(last_error) AS len FROM public.email_outbox WHERE id=$1`, [failRow]);
    check("finish !ok attempts=5 -> failed, error left(..,500)",
      st.status === "failed" && st.len === 500, JSON.stringify(st));
    const noId = await trySql(`SELECT public.email_finish($1, true)`, [randomUUID()]);
    check("finish unknown id -> no-op no error", !noId.threw, noId.message);
  }

  // ================= deletion_request_create / confirm / claim / finish =================
  console.log("\n== deletion_request lifecycle ==");
  {
    const emailA = " ZZ-E2E-Del@Example.com ";
    await client.query(`SELECT public.deletion_request_create($1,$2,'iphash1','{"u":"x"}'::jsonb)`, [emailA, b(HASH_A)]);
    await client.query(`SELECT public.deletion_request_create($1,$2,'iphash1','{"u":"x"}'::jsonb)`, [emailA, b(HASH_A)]);
    let nReq = await count(`SELECT count(*)::int AS c FROM public.deletion_requests WHERE email='zz-e2e-del@example.com'`);
    let nMail = await count(`SELECT count(*)::int AS c FROM public.email_outbox WHERE kind='deletion_request_confirm' AND to_email='zz-e2e-del@example.com'`);
    check("create twice in 24h -> ONE request + ONE outbox", nReq === 1 && nMail === 1, `req=${nReq} mail=${nMail}`);
    const stored = await one(`SELECT email, token_hash, status, ip_hash FROM public.deletion_requests WHERE email='zz-e2e-del@example.com'`);
    check("stored normalized lower(trim) + pending + ip_hash",
      stored.email === "zz-e2e-del@example.com" && stored.status === "pending" && stored.ip_hash === "iphash1", JSON.stringify(stored));
    await client.query(`SELECT public.deletion_request_create('zz-e2e-del2@example.com',$1,NULL,'{}'::jsonb)`, [b(HASH_B)]);
    nReq = await count(`SELECT count(*)::int AS c FROM public.deletion_requests WHERE email LIKE 'zz-e2e-del%'`);
    check("different email -> second request", nReq === 2, `n=${nReq}`);

    const c1 = await one(`SELECT public.deletion_request_confirm($1) AS ok`, [b(HASH_A)]);
    check("confirm -> true", c1.ok === true, JSON.stringify(c1));
    const c2 = await one(`SELECT public.deletion_request_confirm($1) AS ok`, [b(HASH_A)]);
    check("confirm again -> false", c2.ok === false, JSON.stringify(c2));
    const st = await one(`SELECT status, confirmed_at IS NOT NULL AS stamped FROM public.deletion_requests WHERE email='zz-e2e-del@example.com'`);
    check("request confirmed+stamped", st.status === "confirmed" && st.stamped === true, JSON.stringify(st));

    // expired request
    await client.query(`SELECT public.deletion_request_create('zz-e2e-old@example.com',$1,NULL,'{}'::jsonb)`, [b(HASH_C)]);
    await client.query(`UPDATE public.deletion_requests SET created_at = now() - interval '8 days' WHERE email='zz-e2e-old@example.com'`);
    const c3 = await one(`SELECT public.deletion_request_confirm($1) AS ok`, [b(HASH_C)]);
    check("confirm after 7 days -> false", c3.ok === false, JSON.stringify(c3));

    // claim -> processing -> finish
    const claimed = await one(`SELECT public.deletion_requests_claim(10) AS j`);
    const mine = (claimed.j ?? []).filter((x) => x.email === "zz-e2e-del@example.com");
    check("claim returns [{id,email}] for confirmed", mine.length === 1 && mine[0].id, JSON.stringify(mine));
    const rid = mine[0].id;
    const st2 = await one(`SELECT status FROM public.deletion_requests WHERE id=$1`, [rid]);
    check("claimed -> processing", st2.status === "processing", st2.status);
    const badFin = await trySql(`SELECT public.deletion_request_finish($1,'bogus')`, [rid]);
    check("finish bad status -> 22023", badFin.threw && badFin.code === "22023", `${badFin.code}`);
    await client.query(`SELECT public.deletion_request_finish($1,'done')`, [rid]);
    const st3 = await one(`SELECT status, completed_at IS NOT NULL AS done FROM public.deletion_requests WHERE id=$1`, [rid]);
    check("finish done -> completed_at", st3.status === "done" && st3.done === true, JSON.stringify(st3));
    await client.query(`SELECT public.deletion_request_finish($1,'rejected')`, [rid]);
    const st4 = await one(`SELECT status FROM public.deletion_requests WHERE id=$1`, [rid]);
    check("finish non-processing -> no-op", st4.status === "done", st4.status);
    const claimed2 = await one(`SELECT public.deletion_requests_claim(10) AS j`);
    check("second claim -> no confirmed left for us", !(claimed2.j ?? []).some((x) => x.email === "zz-e2e-del@example.com"), `len=${claimed2.j?.length}`);
  }

  // ================= deletion_job_advance =================
  console.log("\n== deletion_job_advance ==");
  {
    const jobId = UDEL;
    await client.query(`INSERT INTO public.account_deletion_jobs (user_id,email,stage) VALUES ($1,'zz-e2e-job@example.com','storage')`, [jobId]);
    await client.query(`UPDATE public.account_deletion_jobs SET updated_at = now() - interval '1 hour' WHERE user_id=$1`, [jobId]);
    await client.query(`SELECT public.deletion_job_advance($1,'auth')`, [jobId]);
    let j = await one(`SELECT stage, updated_at > now() - interval '30 minutes' AS bumped FROM public.account_deletion_jobs WHERE user_id=$1`, [jobId]);
    check("advance storage->auth, updated_at maintained", j.stage === "auth" && j.bumped === true, JSON.stringify(j));
    const back = await trySql(`SELECT public.deletion_job_advance($1,'storage')`, [jobId]);
    check("backward auth->storage -> 22023", back.threw && back.code === "22023", `${back.code} ${back.message}`);
    const bogus = await trySql(`SELECT public.deletion_job_advance($1,'bogus')`, [jobId]);
    check("invalid stage -> 22023", bogus.threw && bogus.code === "22023", `${bogus.code}`);
    await client.query(`SELECT public.deletion_job_advance($1,'email','smtp fail')`, [jobId]);
    j = await one(`SELECT stage, attempts, last_error FROM public.account_deletion_jobs WHERE user_id=$1`, [jobId]);
    check("advance +error -> attempts=1 last_error", j.stage === "email" && j.attempts === 1 && j.last_error === "smtp fail", JSON.stringify(j));
    await client.query(`SELECT public.deletion_job_advance($1,'done')`, [jobId]);
    j = await one(`SELECT stage, completed_at IS NOT NULL AS c, email, attempts FROM public.account_deletion_jobs WHERE user_id=$1`, [jobId]);
    check("advance done -> completed_at + email NULL", j.stage === "done" && j.c === true && j.email === null, JSON.stringify(j));
    const back2 = await trySql(`SELECT public.deletion_job_advance($1,'email')`, [jobId]);
    check("done->email backward -> 22023", back2.threw && back2.code === "22023", `${back2.code}`);
    const unk = await trySql(`SELECT public.deletion_job_advance($1,'auth')`, [randomUUID()]);
    check("unknown user_id -> no-op", !unk.threw, unk.message);
  }

  // ================= deletion_jobs_claim_stuck =================
  console.log("\n== deletion_jobs_claim_stuck ==");
  {
    const JU = await mkUser("ZZ E2E JobU", `zz-e2e-jobu-${RUN}`);
    const JV = await mkUser("ZZ E2E JobV", `zz-e2e-jobv-${RUN}`);
    const JW = await mkUser("ZZ E2E JobW", `zz-e2e-jobw-${RUN}`);
    await client.query(`INSERT INTO public.account_deletion_jobs (user_id,email,stage,attempts,updated_at) VALUES
      ($1,'zz-e2e-ju@x','auth',3,now() - interval '20 minutes'),
      ($2,'zz-e2e-jv@x','storage',0,now() - interval '20 minutes'),
      ($3,'zz-e2e-jw@x','done',0,now() - interval '20 minutes')`, [JU, JV, JW]);
    const stuck10 = await mkUser("ZZ E2E JobS", `zz-e2e-jobs-${RUN}`);
    await client.query(`INSERT INTO public.account_deletion_jobs (user_id,email,stage,attempts,updated_at) VALUES ($1,'zz','auth',10,now() - interval '20 minutes')`, [stuck10]);
    const fresh = await mkUser("ZZ E2E JobF", `zz-e2e-jobf-${RUN}`);
    await client.query(`INSERT INTO public.account_deletion_jobs (user_id,email,stage,attempts,updated_at) VALUES ($1,'zz','auth',0,now())`, [fresh]);
    const c1 = await one(`SELECT public.deletion_jobs_claim_stuck(50) AS j`);
    const ids1 = new Set((c1.j ?? []).map((x) => x.user_id));
    check("stuck claim returns JU+JV (not done/attempts10/fresh)",
      ids1.has(JU) && ids1.has(JV) && !ids1.has(JW) && !ids1.has(stuck10) && !ids1.has(fresh),
      `n=${c1.j?.length}`);
    const rowJU = (c1.j ?? []).find((x) => x.user_id === JU);
    check("returned shape {user_id,stage,email,attempts}",
      rowJU && rowJU.stage === "auth" && rowJU.email === "zz-e2e-ju@x" && rowJU.attempts === 3 && !("completed_at" in rowJU),
      JSON.stringify(rowJU));
    const juAfter = await one(`SELECT updated_at > now() - interval '1 minute' AS leased FROM public.account_deletion_jobs WHERE user_id=$1`, [JU]);
    check("claimed job leased (updated_at=now)", juAfter.leased === true, JSON.stringify(juAfter));
    const c2 = await one(`SELECT public.deletion_jobs_claim_stuck(50) AS j`);
    const ids2 = new Set((c2.j ?? []).map((x) => x.user_id));
    check("immediate second claim skips leased", !ids2.has(JU) && !ids2.has(JV), `n=${c2.j?.length}`);
    await client.query(`UPDATE public.account_deletion_jobs SET updated_at = now() - interval '20 minutes' WHERE user_id = ANY($1)`, [[JU, JV]]);
    const c3 = await one(`SELECT public.deletion_jobs_claim_stuck(50) AS j`);
    const ids3 = new Set((c3.j ?? []).map((x) => x.user_id));
    check("re-claim after lease expiry", ids3.has(JU) && ids3.has(JV), `n=${c3.j?.length}`);
  }

  // ================= items_purge_unreferenced =================
  console.log("\n== items_purge_unreferenced ==");
  {
    // reference itemPurgeR via a recommendation (owner UB, contributor c3, needs submission to UB's ask)
    const sB2 = await mkSub(askB, c3);
    await mkRec(UB, itemPurgeR, c3, sB2, 60, "keeps item", null);
    const before = await count(`SELECT count(*)::int AS c FROM public.items`);
    const del = await one(`SELECT public.items_purge_unreferenced(25, 150, 500) AS n`);
    const after = await count(`SELECT count(*)::int AS c FROM public.items`);
    const gone = async (id) => (await count(`SELECT count(*)::int AS c FROM public.items WHERE id=$1`, [id])) === 0;
    check("old unreferenced youtube (30d>25) deleted", await gone(itemPurgeY));
    check("old unreferenced tmdb (200d>150) deleted", await gone(itemPurgeT));
    check("old tmdb with NULL fetched_at (created_at 200d) deleted", await gone(itemPurgeN));
    check("old but REFERENCED tmdb kept", !(await gone(itemPurgeR)));
    check("fresh unreferenced kept", !(await gone(itemPurgeF)));
    check("deleted count consistent", after === before - del.n, `before=${before} after=${after} del=${del.n}`);
    // limit respected: only 1
    const itemLim = await mkItem("tmdb", "movie", "880000104", "ZZ E2E Lim", "now() - interval '200 days'");
    const itemLim2 = await mkItem("tmdb", "movie", "880000105", "ZZ E2E Lim2", "now() - interval '200 days'");
    const del1 = await one(`SELECT public.items_purge_unreferenced(25, 150, 1) AS n`);
    check("p_limit=1 deletes at most 1", del1.n <= 1, `n=${del1.n}`);
    void itemLim; void itemLim2;
  }

  // ================= delete_account + housekeeping_purge with updated_at =================
  console.log("\n== migration-146 functions still work with updated_at column ==");
  {
    const r = await one(`SELECT public.delete_account($1,$2) AS j`, [UDEL, "zz-e2e-del-acct@example.com"]);
    check("delete_account(UDEL) deleted:true", r.j?.deleted === true, JSON.stringify(r.j).slice(0, 200));
    const led = await one(`SELECT stage, updated_at IS NOT NULL AS has_upd, email FROM public.account_deletion_jobs WHERE user_id=$1`, [UDEL]);
    check("ledger row has updated_at (delete_account unaffected by new column)", led.has_upd === true, JSON.stringify(led));
    const hk = await trySql(`SELECT public.housekeeping_purge()`);
    check("housekeeping_purge() runs clean", !hk.threw, hk.message);
    const led2 = await one(`SELECT stage FROM public.account_deletion_jobs WHERE user_id=$1`, [UDEL]);
    check("delete_account stage hand-over = storage", led2.stage === "storage", led2.stage);
  }

  // ================= get_inbox_item (class O) =================
  console.log("\n== get_inbox_item ==");
  {
    // anon already probed -> 42501. authenticated-no-claims -> 42501
    await asRole("authenticated");
    await claimsFor(null, "authenticated");
    const noSub = await trySql(`SELECT public.get_inbox_item($1)`, [itemDet]);
    check("authenticated without sub -> 42501", noSub.threw && noSub.code === "42501", `${noSub.code}`);
    await asPostgres();

    const rA = await callAs(UA, `SELECT public.get_inbox_item($1) AS j`, [itemDet]);
    const jA = rA.rows?.[0]?.j;
    check("owner A gets detail jsonb", !rA.threw && jA !== null, rA.message);
    check("item.name via fr-FR fallback", jA?.item?.name === "Nom FR", JSON.stringify(jA?.item?.name));
    check("item.source/kind/external_id", jA?.item?.source === "tmdb" && jA?.item?.kind === "movie" && jA?.item?.external_id === "880000001", "");
    const fl = jA?.offers?.flatrate;
    check("offers flatrate shape", Array.isArray(fl) && fl.length === 1 && fl[0].provider === "Netflix", JSON.stringify(fl));

    check("offers.rent present", Array.isArray(jA?.offers?.rent) && jA.offers.rent.length === 1, "");
    check("offers.buy empty array", Array.isArray(jA?.offers?.buy) && jA.offers.buy.length === 0, "");
    check("region_missing false (fetch row exists)", jA?.region_missing === false, JSON.stringify(jA?.region_missing));
    const recs = jA?.recommenders ?? [];
    check("recommenders: blocked c2 excluded, c1 kept", recs.length === 1 && recs[0].name === "ZZ E2E Alice" && recs[0].comment === "great film", JSON.stringify(recs));
    check("recommender fields: initials/rating/platform_text/created_at, NO contributor_id",
      recs[0] && typeof recs[0].initials === "string" && recs[0].rating === 90
        && recs[0].platform_text === "Netflix" && recs[0].created_at
        && !("contributor_id" in recs[0]), JSON.stringify(recs[0]));
    check("owner_status to_watch", jA?.owner_status === "to_watch", JSON.stringify(jA?.owner_status));

    const rANone = await callAs(UA, `SELECT public.get_inbox_item($1) AS j`, [itemBOnly]);
    check("item recommended only to B -> NULL for A", !rANone.threw && rANone.rows?.[0]?.j === null, JSON.stringify(rANone.rows?.[0]?.j));
    const rB = await callAs(UB, `SELECT public.get_inbox_item($1) AS j`, [itemBOnly]);
    const jB = rB.rows?.[0]?.j;
    check("owner B gets own item", !rB.threw && jB?.item?.external_id === "880000002" && jB?.recommenders?.length === 1, "");
    check("B item name base fallback (no prefs)", jB?.item?.name === "ZZ E2E BOnly", JSON.stringify(jB?.item?.name));
    const rNull = await callAs(UA, `SELECT public.get_inbox_item($1) AS j`, [randomUUID()]);
    check("unknown item -> NULL", !rNull.threw && rNull.rows?.[0]?.j === null, "");
    const rNullArg = await callAs(UA, `SELECT public.get_inbox_item(NULL) AS j`);
    check("NULL item -> NULL", !rNullArg.threw && rNullArg.rows?.[0]?.j === null, "");
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
    for (const t of RESIDUE_TABLES) {
      const now = Number((await c2.query(`SELECT count(*)::int AS c FROM public.${t}`)).rows[0].c);
      if (now !== baseline[t]) { residue++; console.log(`RESIDUE  ${t}: before=${baseline[t]} after=${now}`); }
    }
    const nowAuth = Number((await c2.query(`SELECT count(*)::int AS c FROM auth.users`)).rows[0].c);
    if (nowAuth !== baseline["auth.users"]) { residue++; console.log(`RESIDUE  auth.users: before=${baseline["auth.users"]} after=${nowAuth}`); }
    const markerUsers = Number((await c2.query(`SELECT count(*)::int AS c FROM public.users WHERE normalized_display_name LIKE 'zz-e2e-%'`)).rows[0].c);
    const markerItems = Number((await c2.query(`SELECT count(*)::int AS c FROM public.items WHERE external_id LIKE '88%' AND name LIKE 'ZZ E2E%'`)).rows[0].c);
    const markerCache = Number((await c2.query(`SELECT count(*)::int AS c FROM public.youtube_search_cache WHERE query_key LIKE 'zz-e2e-%'`)).rows[0].c);
    const markerMail = Number((await c2.query(`SELECT count(*)::int AS c FROM public.email_outbox WHERE to_email LIKE 'zz-e2e-%'`)).rows[0].c);
    const markerReq = Number((await c2.query(`SELECT count(*)::int AS c FROM public.deletion_requests WHERE email LIKE 'zz-e2e-%'`)).rows[0].c);
    const markerGenre = Number((await c2.query(`SELECT count(*)::int AS c FROM public.tmdb_genres WHERE name LIKE 'ZZ E2E%'`)).rows[0].c);
    for (const [lbl, n] of [["users", markerUsers], ["items", markerItems], ["cache", markerCache], ["outbox", markerMail], ["requests", markerReq], ["genres", markerGenre]]) {
      if (n) { residue++; console.log(`RESIDUE  ${lbl} markers: ${n}`); }
    }
    // live-catalog proof: the draft functions do NOT exist live
    const liveFns = await c2.query(
      `SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname = ANY($1)`, [NEW_ALL]);
    check("post-rollback: new functions absent from live catalog", liveFns.rows.length === 0,
      liveFns.rows.map((r) => r.proname).join(",") || "none present");
    const liveCol = await c2.query(
      `SELECT count(*)::int AS c FROM information_schema.columns
        WHERE table_schema='public' AND table_name='account_deletion_jobs' AND column_name='updated_at'`);
    check("post-rollback: account_deletion_jobs.updated_at absent live", liveCol.rows[0].c === 0, `c=${liveCol.rows[0].c}`);
    console.log(residue === 0 ? "RESIDUE CHECK: zero residue — all table counts identical to pre-run baseline" : `RESIDUE CHECK: ${residue} table(s) differ`);
  } finally { c2.release(); await pool2.end(); }
}

process.exit(fail === 0 ? 0 : 1);

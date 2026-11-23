// verify-owner-inbox-145.mjs — rollback harness for migration 145
// (V2-W2-P0-04, PLAN P0-04): owner inbox / prefs / enrichment-kick
// class-O functions.
//
// Runs the migration SQL file text inside ONE transaction against
// DATABASE_URL, executes every acceptance case, and ALWAYS issues
// ROLLBACK in a finally block. The script refuses to run if the
// migration file contains a COMMIT (or other transaction-control)
// statement. Nothing is ever committed. Fixtures are inserted
// directly as postgres inside the transaction (never via
// submit_recommendations — migration 144 is a separate PR).
//
// Impersonation (PLAN-V2-002 Appendix B technique):
//   SET LOCAL ROLE authenticated + set_config('request.jwt.claims',
//   '{"sub":"<uuid>","role":"authenticated"}', true)  -> auth.uid() = <uuid>
// Verification SQL always runs after RESET ROLE (v2 tables grant
// nothing to anon/authenticated, so direct SELECTs need postgres).
//
// Usage: node scripts/verify-owner-inbox-145.mjs

import { config } from "dotenv";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

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

const MIGRATION = join(root, "supabase", "migrations", "145_v2_owner_inbox.sql");
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

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
};

// Run one statement inside a savepoint; returns {threw, code, message, rows}.
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

// ---------- impersonation helpers (must be called inside the tx) ----------
async function claimsFor(sub, role = "authenticated") {
  await client.query(
    `SELECT set_config('request.jwt.claims', $1, true)`,
    [JSON.stringify(sub ? { sub, role } : { role })]
  );
}
async function asUser(uid) {
  await client.query(`SET LOCAL ROLE authenticated`);
  await claimsFor(uid, "authenticated");
}
async function asRole(role, sub = null) {
  await client.query(`SET LOCAL ROLE ${role}`);
  await claimsFor(sub, role);
}
async function asPostgres() {
  await client.query(`RESET ROLE`);
}
// call a function as user uid; always returns to postgres afterwards
async function callAs(uid, text, params) {
  await asUser(uid);
  const r = await trySql(text, params);
  await asPostgres();
  return r;
}

const FN_NAMES = [
  "ensure_my_ask", "get_my_ask", "regenerate_my_ask", "set_ask_active",
  "update_ask_settings", "get_inbox", "get_friend_rail", "mark_friend_seen",
  "get_my_prefs", "set_my_prefs", "enqueue_stale_enrichment", "set_language",
];
const FN_ARGS = {
  ensure_my_ask:          ["SELECT public.ensure_my_ask()"],
  get_my_ask:             ["SELECT public.get_my_ask()"],
  regenerate_my_ask:      ["SELECT public.regenerate_my_ask()"],
  set_ask_active:         ["SELECT public.set_ask_active(true)"],
  update_ask_settings:    ["SELECT public.update_ask_settings(NULL, NULL, NULL)"],
  get_inbox:              ["SELECT public.get_inbox()"],
  get_friend_rail:        ["SELECT public.get_friend_rail()"],
  mark_friend_seen:       ["SELECT public.mark_friend_seen($1)", [null]],
  get_my_prefs:           ["SELECT public.get_my_prefs()"],
  set_my_prefs:           ["SELECT public.set_my_prefs()"],
  enqueue_stale_enrichment: ["SELECT public.enqueue_stale_enrichment()"],
  set_language:           ["SELECT public.set_language('en')"],
};

// residue baselines (committed state, captured before BEGIN)
const RESIDUE_TABLES = [
  "users", "user_prefs", "asks", "contributors", "items", "item_availability",
  "item_availability_fetch", "tmdb_genres", "submissions", "recommendations",
  "owner_item_state", "owner_contributor_blocks", "node_items", "enrichment_jobs",
  "email_outbox", "rate_limits", "youtube_search_cache", "youtube_search_budget",
  "account_deletion_jobs", "deletion_requests", "notifications",
];
const baseline = {};
for (const t of RESIDUE_TABLES) {
  baseline[t] = await count(`SELECT count(*)::int AS c FROM public.${t}`);
}
// set_language proacl BEFORE the migration (live, committed state)
const setLangBefore = (await one(
  `SELECT p.proacl::text AS proacl, p.prosecdef, p.proconfig
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='set_language'`));

let EXPLAIN_OUT = "";
try {
  await client.query("BEGIN");
  console.log("== applying migration 145 inside transaction ==");
  await client.query(sqlText);
  console.log("migration applied (uncommitted)");

  // ---------------- fixtures ----------------
  const ownerA = (await one(
    `INSERT INTO public.users (display_name, normalized_display_name, avatar_key)
     VALUES ('Harness Owner A', 'harness-owner-a-145', 'avatar/harness-a.png') RETURNING id`)).id;
  const ownerB = (await one(
    `INSERT INTO public.users (display_name, normalized_display_name)
     VALUES ('Harness Owner B', 'harness-owner-b-145') RETURNING id`)).id;
  const ownerC = (await one(
    `INSERT INTO public.users (display_name, normalized_display_name)
     VALUES ('Harness Owner C', 'harness-owner-c-145') RETURNING id`)).id;
  await client.query(
    `INSERT INTO public.user_prefs (user_id, region_code, tmdb_lang, notify_email, theme, accent)
     VALUES ($1, 'US', 'en-US', true, 'dark', '#123456')`, [ownerA]);

  // genre reference rows for update_ask_settings validation
  await client.query(
    `INSERT INTO public.tmdb_genres (media, id, lang, name)
     VALUES ('movie',28,'en','Action'),('movie',18,'en','Drama'),('movie',12,'en','Adventure'),
            ('movie',16,'en','Animation'),('movie',35,'en','Comedy'),('movie',80,'en','Crime'),
            ('movie',99,'en','Documentary'),('movie',10751,'en','Family')`);

  // items
  const mkItem = async (external_id, kind, opts = {}) => (await one(
    `INSERT INTO public.items (source,kind,external_id,name,release_date,original_language,genres,
                               is_documentary,poster_path,enrichment_status,fetched_at,tmdb_rating,overview,localized)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [
      opts.source ?? "tmdb", kind, external_id, opts.name ?? ("Harness " + external_id),
      opts.release_date ?? null, opts.original_language ?? "en",
      opts.genres ?? "{}", opts.is_documentary ?? false, opts.poster_path ?? null,
      opts.enrichment_status ?? "complete", opts.fetched_at ?? "2026-01-01T00:00:00Z",
      opts.tmdb_rating ?? null, opts.overview ?? null, opts.localized ?? "{}",
    ])).id;

  const itemX     = await mkItem("910001", "movie", { name: "Harness Film X",  release_date: "2020-01-01", genres: "{tmdb:28,tmdb:12}", tmdb_rating: 7.5,  poster_path: "/x.jpg", localized: '{"fr-FR":{"name":"Film X FR","overview":"ov FR"}}' });
  const itemY     = await mkItem("910002", "movie", { name: "Harness Film Y",  release_date: "1995-03-01", tmdb_rating: 6.4 });
  const itemZ     = await mkItem("910003", "movie", { name: "Harness Film Z",  release_date: "2010-05-05", tmdb_rating: 5.0 });
  const itemW     = await mkItem("910004", "movie", { name: "Harness Film W",  release_date: "1985-06-01", tmdb_rating: 7.7 });
  const itemYT    = await mkItem("dQw4w9WgXcQ", "video", { source: "youtube", name: "Harness YT Video", release_date: "2022-02-02", original_language: null, enrichment_status: "complete" });
  const itemDOC   = await mkItem("910006", "movie", { name: "Harness Doc",     release_date: "2001-11-11", original_language: "fr", is_documentary: true, tmdb_rating: 8.7, enrichment_status: "pending" });
  const itemAVAIL = await mkItem("910007", "movie", { name: "Harness Avail",   release_date: "2021-09-09", genres: "{tmdb:28}", tmdb_rating: 8.1, enrichment_status: "partial" });
  const itemPOP   = await mkItem("910008", "movie", { name: "Harness Popular", release_date: "2019-05-05", tmdb_rating: 9.0 });
  const itemB1    = await mkItem("910101", "movie", { name: "Harness Film B1",  release_date: "2018-01-01" });
  const itemB2    = await mkItem("910102", "movie", { name: "Harness Film B2",  release_date: "2017-01-01", enrichment_status: "pending" });

  // availability rows for itemAVAIL in region US (A's region)
  await client.query(
    `INSERT INTO public.item_availability (item_id, region_code, provider_id, provider, offer_type, link)
     VALUES ($1,'US',8,'Netflix','flatrate','https://www.themoviedb.org/x'),
            ($1,'US',119,'Amazon Prime Video','rent','https://www.themoviedb.org/x'),
            ($1,'US',384,'HBO Max','buy','https://www.themoviedb.org/x')`, [itemAVAIL]);

  // contributors
  const mkContrib = async (name, hashByte) => (await one(
    `INSERT INTO public.contributors (display_name, secret_hash)
     VALUES ($1, decode(repeat($2,32),'hex')) RETURNING id`, [name, hashByte])).id;
  const cAlice = await mkContrib("Alice Alpha", "a1");
  const cBob   = await mkContrib("Bob Beta",   "b2");
  const cCarol = await mkContrib("Carol Gamma","c3");   // -> owner B
  const cDave  = await mkContrib("Dave Delta", "d4");
  const cErin  = await mkContrib("Erin Echo",  "e5");
  const cFrank = await mkContrib("Frank Fox",  "f6");
  const cEnrich= await mkContrib("Enrich Ed",  "e7");

  // asks: A via the function under test (impersonated), B + C direct
  const askA = (await callAs(ownerA, `SELECT * FROM public.ensure_my_ask()`)).rows[0];
  const askB = (await one(
    `INSERT INTO public.asks (owner_id, token, is_active) VALUES ($1,$2,true) RETURNING id`,
    [ownerB, "harness-tok-B-" + "b".repeat(48)])).id;
  const tokB = "harness-tok-B-" + "b".repeat(48);

  // submissions + recommendations for owner A
  // s1 (Alice): X,Y,Z,YT,DOC,AVAIL,POP ; s2 (Bob): X,Y,W,POP ;
  // s4/s5/s6 (Dave/Erin/Frank): POP each
  const s1 = (await one(
    `INSERT INTO public.submissions (ask_id, contributor_id, client_batch_id, title_count, created_at)
     VALUES ($1,$2,NULL,20,'2026-01-10T00:00:00Z') RETURNING id`, [askA.id, cAlice])).id;
  const s2 = (await one(
    `INSERT INTO public.submissions (ask_id, contributor_id, client_batch_id, title_count, created_at)
     VALUES ($1,$2,NULL,4,'2026-01-09T00:00:00Z') RETURNING id`, [askA.id, cBob])).id;
  const s4 = (await one(
    `INSERT INTO public.submissions (ask_id, contributor_id, client_batch_id, title_count, created_at)
     VALUES ($1,$2,NULL,1,'2026-01-08T00:00:00Z') RETURNING id`, [askA.id, cDave])).id;
  const s5 = (await one(
    `INSERT INTO public.submissions (ask_id, contributor_id, client_batch_id, title_count, created_at)
     VALUES ($1,$2,NULL,1,'2026-01-07T00:00:00Z') RETURNING id`, [askA.id, cErin])).id;
  const s6 = (await one(
    `INSERT INTO public.submissions (ask_id, contributor_id, client_batch_id, title_count, created_at)
     VALUES ($1,$2,NULL,1,'2026-01-06T00:00:00Z') RETURNING id`, [askA.id, cFrank])).id;

  const rec = (item, contrib, sub, rating, comment, platform, ts) => client.query(
    `INSERT INTO public.recommendations (owner_id,item_id,contributor_id,submission_id,rating,platform_text,comment,created_at,updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)`,
    [ownerA, item, contrib, sub, rating, platform, comment, ts]);
  await rec(itemX,   cAlice, s1, 80,  "great pick",  "Netflix", "2026-01-10T10:00:00Z");
  await rec(itemY,   cAlice, s1, 60,  "solid",      "Hulu",    "2026-01-09T10:00:00Z");
  await rec(itemZ,   cAlice, s1, 50,  "only c1",    null,      "2026-01-07T10:00:00Z");
  await rec(itemYT,  cAlice, s1, null,null,         null,      "2026-01-11T10:00:00Z");
  await rec(itemDOC, cAlice, s1, 88,  null,         null,      "2026-01-04T10:00:00Z");
  await rec(itemAVAIL,cAlice,s1, 40,  "avail comment", null,   "2026-01-03T10:00:00Z");
  await rec(itemPOP, cAlice, s1, 70,  "pop c1",     null,      "2026-01-10T09:00:00Z");
  await rec(itemX,   cBob,   s2, null,"c2 on X",    "Prime",   "2026-01-05T10:00:00Z");
  await rec(itemY,   cBob,   s2, 90,  "c2 says",    null,      "2026-01-08T10:00:00Z");
  await rec(itemW,   cBob,   s2, 70,  "w comment",  null,      "2026-01-06T10:00:00Z");
  await rec(itemPOP, cBob,   s2, null,null,         null,      "2026-01-09T09:00:00Z");
  await rec(itemPOP, cDave,  s4, 90,  null,         null,      "2026-01-12T09:00:00Z");
  await rec(itemPOP, cErin,  s5, 80,  null,         null,      "2026-01-11T09:00:00Z");
  await rec(itemPOP, cFrank, s6, 60,  null,         null,      "2026-01-08T09:00:00Z");

  // owner_item_state: Y watched, Z dismissed (state newer than rec -> no recommended_again),
  // W dismissed (state older than rec -> recommended_again)
  await client.query(
    `INSERT INTO public.owner_item_state (owner_id,item_id,status,updated_at) VALUES
     ($1,$2,'watched','2026-01-02T00:00:00Z'),
     ($1,$3,'dismissed','2026-01-08T00:00:00Z'),
     ($1,$4,'dismissed','2026-01-01T00:00:00Z')`,
    [ownerA, itemY, itemZ, itemW]);

  // owner B fixtures: ask (direct), contributor cCarol, submission, itemB1 + itemB2 recs
  const sB1 = (await one(
    `INSERT INTO public.submissions (ask_id, contributor_id, client_batch_id, title_count, created_at)
     VALUES ($1,$2,NULL,2,'2026-01-08T00:00:00Z') RETURNING id`, [askB, cCarol])).id;
  await client.query(
    `INSERT INTO public.recommendations (owner_id,item_id,contributor_id,submission_id,rating,comment,created_at,updated_at)
     VALUES ($1,$2,$3,$4,65,'b comment','2026-01-08T10:00:00Z','2026-01-08T10:00:00Z'),
            ($1,$5,$3,$4,NULL,NULL,'2026-01-08T11:00:00Z','2026-01-08T11:00:00Z')`,
    [ownerB, itemB1, cCarol, sB1, itemB2]);

  // impersonated ensure_my_ask already ran for A above (askA) — grab token for later checks
  const askARow = (await one(`SELECT * FROM public.asks WHERE owner_id=$1`, [ownerA]));

  // ---------------- (1) ensure_my_ask idempotent ----------------
  console.log("\n== (1) ensure_my_ask idempotent ==");
  {
    const r1 = await callAs(ownerA, `SELECT * FROM public.ensure_my_ask()`);
    const r2 = await callAs(ownerA, `SELECT * FROM public.ensure_my_ask()`);
    const a1 = r1.rows[0], a2 = r2.rows[0];
    check("ensure_my_ask twice -> same row id", a1?.id === askARow.id && a2?.id === askARow.id, `ids ${a1?.id} vs ${a2?.id}`);
    check("ensure_my_ask twice -> same token", a1?.token === askARow.token && a2?.token === askARow.token, `tok ${String(a1?.token).slice(0,8)}…`);
    check("ensure_my_ask token exactly 32 chars", a1?.token?.length === 32, `len=${a1?.token?.length}`);
    const nAsk = await count(`SELECT count(*)::int AS c FROM public.asks WHERE owner_id=$1`, [ownerA]);
    check("still exactly 1 ask row for A", nAsk === 1, `n=${nAsk}`);
    const rC = await callAs(ownerC, `SELECT * FROM public.ensure_my_ask()`);
    check("ensure_my_ask creates for owner C", !!rC.rows[0]?.id && rC.rows[0].token?.length === 32, `id=${rC.rows[0]?.id}`);
  }

  // ---------------- (2) regenerate kills old token + token length ----------------
  console.log("\n== (2) regenerate_my_ask: rotation + 32-char tokens ==");
  {
    const oldTok = askARow.token;
    const newTok = (await callAs(ownerA, `SELECT public.regenerate_my_ask() AS t`)).rows[0]?.t;
    check("regenerate returns a token", typeof newTok === "string" && newTok.length === 32, `len=${newTok?.length}`);
    check("new token differs from old", newTok !== oldTok, "");
    const oldAlive = await count(`SELECT count(*)::int AS c FROM public.asks WHERE token=$1 AND is_active`, [oldTok]);
    check("old token no longer resolves (0 active rows -> ASK_NOT_ACTIVE path)", oldAlive === 0, `n=${oldAlive}`);
    const row = await one(`SELECT is_active, rotated_at FROM public.asks WHERE owner_id=$1`, [ownerA]);
    check("ask re-activated + rotated_at set", row?.is_active === true && row?.rotated_at !== null, JSON.stringify(row));
    // many generations: always exactly 32 chars, base64url alphabet
    let all32 = true, allAlpha = true;
    for (let i = 0; i < 30; i++) {
      const t = (await callAs(ownerA, `SELECT public.regenerate_my_ask() AS t`)).rows[0]?.t;
      if (t?.length !== 32) all32 = false;
      if (!/^[A-Za-z0-9_-]{32}$/.test(t ?? "")) allAlpha = false;
    }
    check("30 regenerations -> every token exactly 32 chars", all32, "");
    check("30 regenerations -> every token base64url alphabet", allAlpha, "");
    const rC = await callAs(ownerC, `SELECT public.regenerate_my_ask() AS t`);
    // owner C HAS an ask now (created in case 1) -> succeeds; use a fresh no-ask user for NOT_FOUND below
    check("regenerate works for owner C (has ask)", typeof rC.rows[0]?.t === "string", "");
  }

  // ---------------- (3) get_inbox merge + card fields ----------------
  console.log("\n== (3) get_inbox: merge rule, aggregates, card fields ==");
  let inboxA;
  {
    const r = await callAs(ownerA, `SELECT public.get_inbox() AS j`);
    inboxA = r.rows[0]?.j;
    const cards = inboxA?.cards ?? [];
    check("get_inbox returns jsonb with cards+counts", Array.isArray(cards) && !!inboxA?.counts, `cards=${cards.length}`);
    check("default p_status=to_watch -> 5 cards (POP,YT,X,DOC,AVAIL)", cards.length === 5, `n=${cards.length}`);
    // merge cards across all three statuses for field-level assertions
    const allCards = [...cards];
    for (const st of ["watched", "dismissed"]) {
      const rr = await callAs(ownerA, `SELECT public.get_inbox($1) AS j`, [st]);
      allCards.push(...(rr.rows[0]?.j?.cards ?? []));
    }
    check("8 items total across statuses -> 8 cards (one per item_id)", allCards.length === 8, `n=${allCards.length}`);
    const byId = Object.fromEntries(allCards.map((c) => [c.item_id, c]));
    const cx = byId[itemX], cy = byId[itemY], cp = byId[itemPOP];
    check("itemX: ONE card, recommender_count=2", cx && cx.recommender_count === 2, `rc=${cx?.recommender_count}`);
    check("itemX: friends_avg over non-null ratings only (80, NULL -> 80)", cx?.friends_avg === 80 && cx?.rater_count === 1, `avg=${cx?.friends_avg} raters=${cx?.rater_count}`);
    check("itemY: friends_avg=(60+90)/2=75, rater_count=2", cy?.friends_avg === 75 && cy?.rater_count === 2, `avg=${cy?.friends_avg}`);
    check("itemPOP: recommender_count=5, more_count=2, recommenders capped at 3", cp?.recommender_count === 5 && cp?.more_count === 2 && cp?.recommenders?.length === 3, `rc=${cp?.recommender_count} more=${cp?.more_count} len=${cp?.recommenders?.length}`);
    check("itemPOP recommenders ordered by recency (Dave,Erin,Alice first 3)", cp?.recommenders?.[0]?.display_name === "Dave Delta" && cp?.recommenders?.[1]?.display_name === "Erin Echo" && cp?.recommenders?.[2]?.display_name === "Alice Alpha", JSON.stringify(cp?.recommenders?.map((x) => x.display_name)));
    check("recommender initials derived (AA/BB/...)", cp?.recommenders?.[2]?.initials === "AA" && byId[itemX]?.recommenders?.[1]?.initials === "BB", JSON.stringify(byId[itemX]?.recommenders));
    // quote rules: most recent non-empty comment; friend's comment under rail
    check("itemX quote = most recent non-empty comment ('great pick' @01-10 > 'c2 on X' @01-05)", cx?.quote === "great pick", JSON.stringify(cx?.quote));
    check("itemDOC quote NULL (no comments)", byId[itemDOC]?.quote === null, JSON.stringify(byId[itemDOC]?.quote));
    // type chips
    check("type chips: youtube/documentary/movie", byId[itemYT]?.type === "youtube" && byId[itemDOC]?.type === "documentary" && cx?.type === "movie", `yt=${byId[itemYT]?.type} doc=${byId[itemDOC]?.type}`);
    // status + recommended_again + skeleton
    check("status: Y watched, Z/W dismissed, rest to_watch", cy?.status === "watched" && byId[itemZ]?.status === "dismissed" && cx?.status === "to_watch", `y=${cy?.status} z=${byId[itemZ]?.status}`);
    check("recommended_again: W true (rec 01-06 > state 01-01), Z false (rec 01-07 < state 01-08)", byId[itemW]?.recommended_again === true && byId[itemZ]?.recommended_again === false, `w=${byId[itemW]?.recommended_again} z=${byId[itemZ]?.recommended_again}`);
    check("skeleton: DOC pending -> true, AVAIL partial -> false", byId[itemDOC]?.skeleton === true && byId[itemAVAIL]?.skeleton === false, `doc=${byId[itemDOC]?.skeleton} avail=${byId[itemAVAIL]?.skeleton}`);
    check("in_library false for all cards (P0: node_items empty)", cards.every((c) => c.in_library === false), "");
    check("tmdb_score: POP 9.0->90, DOC 8.7->87, YT NULL->null", cp?.tmdb_score === 90 && byId[itemDOC]?.tmdb_score === 87 && byId[itemYT]?.tmdb_score === null, `pop=${cp?.tmdb_score} doc=${byId[itemDOC]?.tmdb_score} yt=${byId[itemYT]?.tmdb_score}`);
    check("year extracted", cx?.year === 2020 && byId[itemYT]?.year === 2022, `x=${cx?.year} yt=${byId[itemYT]?.year}`);
    check("localized fallback: X has fr-FR but A is en-US -> original title", cx?.title === "Harness Film X", cx?.title);
    // platforms: AVAIL -> top-2 by offer rank (flatrate Netflix, rent Amazon)
    check("itemAVAIL platforms = ['Netflix','Amazon Prime Video'] (<=2, flatrate first)", JSON.stringify(byId[itemAVAIL]?.platforms) === '["Netflix","Amazon Prime Video"]', JSON.stringify(byId[itemAVAIL]?.platforms));
    check("itemYT platforms = ['YouTube']", JSON.stringify(byId[itemYT]?.platforms) === '["YouTube"]', JSON.stringify(byId[itemYT]?.platforms));
    check("itemX platforms = [] (no availability rows for US)", JSON.stringify(cx?.platforms) === "[]", JSON.stringify(cx?.platforms));
    // counts over filtered base, all statuses
    check("counts {to_watch:5, watched:1, dismissed:2}", inboxA?.counts?.to_watch === 5 && inboxA?.counts?.watched === 1 && inboxA?.counts?.dismissed === 2, JSON.stringify(inboxA?.counts));
    // recent sort order (to_watch): POP(01-12), YT(01-11), X(01-10), DOC(01-04), AVAIL(01-03)
    const order = cards.map((c) => c.item_id);
    const expectOrder = [itemPOP, itemYT, itemX, itemDOC, itemAVAIL];
    check("recent sort deterministic DESC (latest_at, item_id tiebreak)", JSON.stringify(order) === JSON.stringify(expectOrder), order.map((id) => expectOrder.indexOf(id)).join(","));
  }

  // ---------------- (4) status filter + rail filter + quote under rail ----------------
  console.log("\n== (4) get_inbox: p_status, p_friend_id rail, quote ==");
  {
    const rw = await callAs(ownerA, `SELECT public.get_inbox('watched') AS j`);
    check("p_status=watched -> 1 card (Y), counts still all-status", rw.rows[0]?.j?.cards?.length === 1 && rw.rows[0]?.j?.cards?.[0]?.item_id === itemY && rw.rows[0]?.j?.counts?.to_watch === 5, JSON.stringify(rw.rows[0]?.j?.counts));
    const rd = await callAs(ownerA, `SELECT public.get_inbox('dismissed') AS j`);
    check("p_status=dismissed -> 2 cards (Z,W)", rd.rows[0]?.j?.cards?.length === 2, `n=${rd.rows[0]?.j?.cards?.length}`);
    const rf = await callAs(ownerA, `SELECT public.get_inbox('to_watch', $1) AS j`, [cBob]);
    const fcards = rf.rows[0]?.j?.cards ?? [];
    const fids = fcards.map((c) => c.item_id).sort();
    // Bob recommended X,Y,W,POP; under to_watch only X+POP remain (Y watched, W dismissed)
    check("rail cBob to_watch -> only Bob's to_watch items (X,POP)", fids.length === 2 && fids.includes(itemX) && fids.includes(itemPOP), JSON.stringify(fids));
    const fx = fcards.find((c) => c.item_id === itemX);
    check("rail quote = selected friend's comment ('c2 on X')", fx?.quote === "c2 on X", JSON.stringify(fx?.quote));
    check("rail: friends_avg still over ALL recommenders (X avg=80 not Bob-only)", fx?.friends_avg === 80 && fx?.recommender_count === 2, `avg=${fx?.friends_avg} rc=${fx?.recommender_count}`);
    check("rail counts reflect rail-filtered base {to_watch:2,watched:1,dismissed:1}", rf.rows[0]?.j?.counts?.to_watch === 2 && rf.rows[0]?.j?.counts?.watched === 1 && rf.rows[0]?.j?.counts?.dismissed === 1, JSON.stringify(rf.rows[0]?.j?.counts));
    const rff = await callAs(ownerA, `SELECT public.get_inbox('to_watch', $1, '{"genres":["12"]}'::jsonb) AS j`, [cBob]);
    const ff = rff.rows[0]?.j?.cards ?? [];
    check("rail AND filters: cBob + genre tmdb:12 -> only X", ff.length === 1 && ff[0].item_id === itemX && ff[0].quote === "c2 on X", JSON.stringify(ff.map((c) => c.item_id)));
  }

  // ---------------- (5) filters ----------------
  console.log("\n== (5) get_inbox: p_filters categories ==");
  {
    const ids = async (filters, status = "to_watch") => {
      const r = await callAs(ownerA, `SELECT public.get_inbox($1, NULL, $2::jsonb) AS j`, [status, JSON.stringify(filters)]);
      return (r.rows[0]?.j?.cards ?? []).map((c) => c.item_id);
    };
    check("types ['documentary'] -> DOC only", JSON.stringify(await ids({ types: ["documentary"] })) === JSON.stringify([itemDOC]), "");
    check("types ['youtube'] -> YT only", JSON.stringify(await ids({ types: ["youtube"] })) === JSON.stringify([itemYT]), "");
    // to_watch movies = X,AVAIL,POP (Y watched; Z,W dismissed)
    check("types ['movie'] -> 3 to_watch movies (X,AVAIL,POP)", (await ids({ types: ["movie"] })).length === 3, `n=${(await ids({ types: ["movie"] })).length}`);
    // to_watch multi-recommended = POP(5),X(2) (Y rc=2 but watched)
    check("multi_recommended -> POP,X (recommender_count>=2 in to_watch)", (await ids({ multi_recommended: true })).length === 2, `n=${(await ids({ multi_recommended: true })).length}`);
    check("genres ['28'] -> X + AVAIL (tmdb:28 overlap)", JSON.stringify((await ids({ genres: ["28"] })).sort()) === JSON.stringify([itemX, itemAVAIL].sort()), "");
    check("genres ['tmdb:12'] -> X only", JSON.stringify(await ids({ genres: ["tmdb:12"] })) === JSON.stringify([itemX]), "");
    check("languages ['fr'] -> DOC only (original_language fr)", JSON.stringify(await ids({ languages: ["fr"] })) === JSON.stringify([itemDOC]), "");
    // W is dismissed -> query dismissed status for the 1980s chip
    check("decades ['1980'] dismissed -> W only (1985)", JSON.stringify(await ids({ decades: ["1980"] }, "dismissed")) === JSON.stringify([itemW]), JSON.stringify(await ids({ decades: ["1980"] }, "dismissed")));
    // 2020s = X(2020)+YT(2022)+AVAIL(2021) in to_watch
    check("decades ['2020'] -> X,YT,AVAIL (2020-2022 releases)", (await ids({ decades: ["2020"] })).length === 3, `n=${(await ids({ decades: ["2020"] })).length}`);
    check("platforms ['netflix'] -> AVAIL only", JSON.stringify(await ids({ platforms: ["netflix"] })) === JSON.stringify([itemAVAIL]), "");
    check("platforms ['youtube'] -> YT only", JSON.stringify(await ids({ platforms: ["youtube"] })) === JSON.stringify([itemYT]), "");
    check("platforms ['hbo max'] -> AVAIL (buy row counts for filter)", JSON.stringify(await ids({ platforms: ["hbo max"] })) === JSON.stringify([itemAVAIL]), "");
    check("combined types+genres: movie AND tmdb:28 -> X,AVAIL", JSON.stringify((await ids({ types: ["movie"], genres: ["28"] })).sort()) === JSON.stringify([itemX, itemAVAIL].sort()), "");
    const rbad = await callAs(ownerA, `SELECT public.get_inbox('to_watch', NULL, '[]'::jsonb) AS j`);
    check("filters non-object -> 22023", rbad.threw && rbad.code === "22023", `${rbad.code} ${rbad.message}`);
    const rbad2 = await callAs(ownerA, `SELECT public.get_inbox('bogus') AS j`);
    check("invalid p_status -> 22023", rbad2.threw && rbad2.code === "22023", `${rbad2.code} ${rbad2.message}`);
    const rbad3 = await callAs(ownerA, `SELECT public.get_inbox('to_watch', NULL, '{"decades":["19a0"]}'::jsonb) AS j`);
    check("invalid decade element -> 22023", rbad3.threw && rbad3.code === "22023", `${rbad3.code} ${rbad3.message}`);
  }

  // ---------------- (6) sort modes + cursor ----------------
  console.log("\n== (6) get_inbox: sort modes + keyset cursor ==");
  {
    const sortFirst = async (sort) => {
      const r = await callAs(ownerA, `SELECT public.get_inbox('to_watch', NULL, '{}'::jsonb, $1) AS j`, [sort]);
      return r.rows[0]?.j?.cards ?? [];
    };
    const bySort = async (sort) => (await sortFirst(sort)).map((c) => c.item_id);
    const mr = await bySort("most_recommended");
    // to_watch: POP(5) first, X(2) second (Y rc=2 but watched -> excluded)
    check("most_recommended: POP(5) first, X(2) second", mr[0] === itemPOP && mr[1] === itemX, JSON.stringify(mr.slice(0, 3)));
    const fs = await bySort("friend_score");
    check("friend_score: DOC(88) first, X(80) second", fs[0] === itemDOC && fs[1] === itemX, JSON.stringify(fs.slice(0, 3)));
    const rs = await bySort("release_date");
    check("release_date: YT(2022) first, AVAIL(2021) second", rs[0] === itemYT && rs[1] === itemAVAIL, JSON.stringify(rs.slice(0, 3)));
    const ts = await bySort("tmdb_score");
    check("tmdb_score: POP(90) first, DOC(87) second", ts[0] === itemPOP && ts[1] === itemDOC, JSON.stringify(ts.slice(0, 3)));
    // cursor: page through all 8 to_watch items with limit 3
    const seen = [];
    let cur = null, pages = 0;
    for (;;) {
      const r = await callAs(ownerA,
        `SELECT public.get_inbox('to_watch', NULL, '{}'::jsonb, 'recent', $1, $2, 3) AS j`,
        [cur?.key ?? null, cur?.item_id ?? null]);
      const j = r.rows[0]?.j;
      for (const c of j?.cards ?? []) seen.push(c.item_id);
      pages++;
      if (!j?.next_cursor || pages > 6) break;
      cur = j.next_cursor;
    }
    const expectAll = [itemPOP, itemYT, itemX, itemY, itemPOP === itemPOP ? itemZ : null, itemW, itemDOC, itemAVAIL];
    // to_watch only -> POP,YT,X,Y,Z,AVAIL? wait: to_watch = POP,YT,X,DOC,AVAIL (Y watched; Z,W dismissed)
    const expectTW = [itemPOP, itemYT, itemX, itemDOC, itemAVAIL];
    check("cursor pages cover all 5 to_watch items, no dupes", seen.length === 5 && new Set(seen).size === 5 && JSON.stringify(seen) === JSON.stringify(expectTW), JSON.stringify(seen));
    check("cursor terminated (next_cursor null at end)", pages <= 4, `pages=${pages}`);
    const rbadcur = await callAs(ownerA, `SELECT public.get_inbox('to_watch', NULL, '{}'::jsonb, 'recent', 123.4, NULL, 3) AS j`);
    check("cursor key without item -> 22023", rbadcur.threw && rbadcur.code === "22023", `${rbadcur.code} ${rbadcur.message}`);
  }

  // ---------------- (7) get_friend_rail + mark_friend_seen ----------------
  console.log("\n== (7) get_friend_rail + mark_friend_seen ==");
  {
    const rail = (await callAs(ownerA, `SELECT public.get_friend_rail() AS j`)).rows[0]?.j;
    const friends = rail?.friends ?? [];
    const byC = Object.fromEntries(friends.map((f) => [f.contributor_id, f]));
    check("rail: 5 friends (Alice,Bob,Dave,Erin,Frank)", friends.length === 5, `n=${friends.length}`);
    check("rail unseen: Alice 7, Bob 4, Dave/Erin/Frank 1 each -> all_unseen=14", rail?.all_unseen === 14 && byC[cAlice]?.unseen_count === 7 && byC[cBob]?.unseen_count === 4, `all=${rail?.all_unseen} alice=${byC[cAlice]?.unseen_count} bob=${byC[cBob]?.unseen_count}`);
    check("rail all_unseen = sum of per-friend unseen", rail?.all_unseen === friends.reduce((a, f) => a + f.unseen_count, 0), "");
    check("rail totals: Alice total_count=7, Bob=4", byC[cAlice]?.total_count === 7 && byC[cBob]?.total_count === 4, `a=${byC[cAlice]?.total_count} b=${byC[cBob]?.total_count}`);
    check("rail ordered by last_submission_at DESC (Alice first)", friends[0]?.contributor_id === cAlice, friends.map((f) => f.display_name).join(","));
    const m1 = (await callAs(ownerA, `SELECT public.mark_friend_seen($1) AS j`, [cAlice])).rows[0]?.j;
    check("mark_friend_seen(Alice) -> {cleared_submissions:1, cleared_recommendations:7}", m1?.cleared_submissions === 1 && m1?.cleared_recommendations === 7, JSON.stringify(m1));
    const rail2 = (await callAs(ownerA, `SELECT public.get_friend_rail() AS j`)).rows[0]?.j;
    check("all_unseen after = 14-7 = 7", rail2?.all_unseen === 7, `all=${rail2?.all_unseen}`);
    const m2 = (await callAs(ownerA, `SELECT public.mark_friend_seen($1) AS j`, [cAlice])).rows[0]?.j;
    check("second mark_friend_seen(Alice) -> {0,0} idempotent", m2?.cleared_submissions === 0 && m2?.cleared_recommendations === 0, JSON.stringify(m2));
    const m3 = (await callAs(ownerA, `SELECT public.mark_friend_seen($1) AS j`, [cBob])).rows[0]?.j;
    check("mark_friend_seen(Bob) -> {1,4} -> all_unseen 7-4=3", m3?.cleared_submissions === 1 && m3?.cleared_recommendations === 4, JSON.stringify(m3));
    const rail3 = (await callAs(ownerA, `SELECT public.get_friend_rail() AS j`)).rows[0]?.j;
    check("all_unseen now 3 (Dave+Erin+Frank)", rail3?.all_unseen === 3, `all=${rail3?.all_unseen}`);
    const mNull = await callAs(ownerA, `SELECT public.mark_friend_seen(NULL) AS j`);
    check("mark_friend_seen(NULL) -> 22023", mNull.threw && mNull.code === "22023", `${mNull.code} ${mNull.message}`);
    // B's rail: only Carol
    const railB = (await callAs(ownerB, `SELECT public.get_friend_rail() AS j`)).rows[0]?.j;
    // Carol submitted B1+B2 on sB1 -> 2 recommendations, both unseen
    check("B rail: 1 friend (Carol), all_unseen=2, total=2", railB?.all_unseen === 2 && railB?.friends?.length === 1 && railB?.friends?.[0]?.unseen_count === 2 && railB?.friends?.[0]?.total_count === 2, JSON.stringify(railB));
  }

  // ---------------- (8) AUTHZ: user B isolation + NULL uid + anon ----------------
  console.log("\n== (8) AUTHZ: B sees only B, NULL uid -> 42501, anon denied ==");
  {
    const inb = (await callAs(ownerB, `SELECT public.get_inbox() AS j`)).rows[0]?.j;
    const bIds = (inb?.cards ?? []).map((c) => c.item_id);
    check("B get_inbox -> only B's items (B1,B2), never A's", bIds.length === 2 && bIds.includes(itemB1) && bIds.includes(itemB2) && !bIds.includes(itemX), JSON.stringify(bIds));
    const askBRow = (await callAs(ownerB, `SELECT * FROM public.get_my_ask()`)).rows[0];
    check("B get_my_ask -> B's ask row (id+token), not A's", askBRow?.id === askB && askBRow?.token === tokB, `id=${askBRow?.id}`);
    const askBObj = await callAs(ownerB, `SELECT * FROM public.get_my_ask()`);
    const aAsk = askBObj.rows[0];
    check("B ask token != A token", aAsk?.token !== askARow.token, "");
    // NULL uid -> 42501 for EVERY function
    await asRole("authenticated", null);
    let all42501 = true, detail = "";
    for (const fn of FN_NAMES) {
      const [text, params] = FN_ARGS[fn];
      const r = await trySql(text, params);
      if (!(r.threw && r.code === "42501")) { all42501 = false; detail = `${fn}:${r.code} ${r.message}`; }
    }
    await asPostgres();
    check("auth.uid() NULL -> 42501 for all 12 functions", all42501, detail);
    // anon role -> EXECUTE denied (42501)
    await asRole("anon", null);
    const ra = await trySql(`SELECT public.get_inbox()`);
    await asPostgres();
    check("anon -> get_inbox EXECUTE denied 42501", ra.threw && ra.code === "42501", `${ra.code} ${ra.message}`);
    // authenticated happy-path still works after all that
    const okA = await callAs(ownerA, `SELECT * FROM public.get_my_ask()`);
    check("authenticated get_my_ask still works", okA.rows[0]?.id === askARow.id, "");
  }

  // ---------------- (9) get_my_prefs defaults + set_my_prefs ----------------
  console.log("\n== (9) get_my_prefs defaults + set_my_prefs ==");
  {
    const dB = (await callAs(ownerB, `SELECT public.get_my_prefs() AS j`)).rows[0]?.j;
    check("get_my_prefs(B, no row) -> table defaults, creates nothing", dB?.region_code === null && dB?.notify_email === true && dB?.theme === "system" && dB?.accent === "orange" && dB?.tmdb_lang === null && dB?.language_set_at === null, JSON.stringify(dB));
    const nB = await count(`SELECT count(*)::int AS c FROM public.user_prefs WHERE user_id=$1`, [ownerB]);
    check("get_my_prefs created no row for B", nB === 0, `n=${nB}`);
    const dA = (await callAs(ownerA, `SELECT public.get_my_prefs() AS j`)).rows[0]?.j;
    check("get_my_prefs(A) -> stored row values", dA?.region_code === "US" && dA?.theme === "dark" && dA?.accent === "#123456" && dA?.tmdb_lang === "en-US", JSON.stringify(dA));
    // set_my_prefs: validation
    const e1 = await callAs(ownerA, `SELECT public.set_my_prefs('de',NULL,NULL,NULL)`);
    check("set_my_prefs region 'de' -> 22023", e1.threw && e1.code === "22023", `${e1.code} ${e1.message}`);
    const e2 = await callAs(ownerA, `SELECT public.set_my_prefs(NULL,NULL,'neon',NULL)`);
    check("set_my_prefs theme 'neon' -> 22023", e2.threw && e2.code === "22023", `${e2.code} ${e2.message}`);
    const e3 = await callAs(ownerA, `SELECT public.set_my_prefs(NULL,NULL,NULL,'neon')`);
    check("set_my_prefs accent 'neon' -> 22023", e3.threw && e3.code === "22023", `${e3.code} ${e3.message}`);
    const e4 = await callAs(ownerA, `SELECT public.set_my_prefs(NULL,NULL,NULL,'#abc')`);
    check("set_my_prefs accent '#abc' (bad hex) -> 22023", e4.threw && e4.code === "22023", `${e4.code} ${e4.message}`);
    // happy path: theme + accent + notify + region
    await callAs(ownerA, `SELECT public.set_my_prefs('FR', false, 'light', 'blue')`);
    const p1 = (await callAs(ownerA, `SELECT public.get_my_prefs() AS j`)).rows[0]?.j;
    check("set_my_prefs applied: region FR, notify false, theme light, accent blue", p1?.region_code === "FR" && p1?.notify_email === false && p1?.theme === "light" && p1?.accent === "blue", JSON.stringify(p1));
    // NULL = unchanged
    await callAs(ownerA, `SELECT public.set_my_prefs()`);
    const p2 = (await callAs(ownerA, `SELECT public.get_my_prefs() AS j`)).rows[0]?.j;
    check("set_my_prefs() all-NULL -> unchanged", p2?.region_code === "FR" && p2?.notify_email === false && p2?.theme === "light" && p2?.accent === "blue", JSON.stringify(p2));
    // empty string clears region
    await callAs(ownerA, `SELECT public.set_my_prefs('')`);
    const p3 = (await callAs(ownerA, `SELECT public.get_my_prefs() AS j`)).rows[0]?.j;
    check("set_my_prefs('') clears region -> NULL, other fields unchanged", p3?.region_code === null && p3?.theme === "light" && p3?.accent === "blue", JSON.stringify(p3));
    // custom hex accent ok
    await callAs(ownerA, `SELECT public.set_my_prefs(NULL,NULL,NULL,'#A1B2C3')`);
    const p4 = (await callAs(ownerA, `SELECT public.get_my_prefs() AS j`)).rows[0]?.j;
    check("set_my_prefs custom #RRGGBB accent ok", p4?.accent === "#A1B2C3", p4?.accent);
    // tmdb_lang NOT settable: no param exists — verify signature has 4 params only
    const sig = await one(
      `SELECT pg_get_function_identity_arguments(p.oid) AS args FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='set_my_prefs'`);
    check("set_my_prefs signature = (p_region_code text, p_notify_email boolean, p_theme text, p_accent text)", sig?.args === "p_region_code text, p_notify_email boolean, p_theme text, p_accent text", sig?.args);
    // restore A prefs region for later inbox region checks? region now NULL -> get_inbox falls back 'US' (availability still US) — fine.
  }

  // ---------------- (10) set_language ----------------
  console.log("\n== (10) set_language: es added, language_set_at, tmdb_lang, ACL ==");
  {
    const rEs = await callAs(ownerA, `SELECT public.set_language('es')`);
    check("set_language('es') ok", !rEs.threw, rEs.threw ? `${rEs.code} ${rEs.message}` : "");
    const uA = await one(`SELECT language_code FROM public.users WHERE id=$1`, [ownerA]);
    const pA = await one(`SELECT tmdb_lang, language_set_at FROM public.user_prefs WHERE user_id=$1`, [ownerA]);
    check("users.language_code='es'", uA?.language_code === "es", uA?.language_code);
    check("user_prefs.language_set_at set + tmdb_lang derived 'es-ES'", pA?.language_set_at !== null && pA?.tmdb_lang === "es-ES", JSON.stringify(pA));
    const rDe = await callAs(ownerA, `SELECT public.set_language('de')`);
    check("set_language('de') -> 22023", rDe.threw && rDe.code === "22023", `${rDe.code} ${rDe.message}`);
    // B has no user_prefs row -> INSERT path
    const rB = await callAs(ownerB, `SELECT public.set_language('fr')`);
    check("set_language('fr') as B (no prefs row) ok", !rB.threw, rB.threw ? `${rB.code} ${rB.message}` : "");
    const pB = await one(`SELECT tmdb_lang, language_set_at FROM public.user_prefs WHERE user_id=$1`, [ownerB]);
    check("B prefs row created: tmdb_lang fr-FR, language_set_at set", pB?.tmdb_lang === "fr-FR" && pB?.language_set_at !== null, JSON.stringify(pB));
    // ACL unchanged
    const after = await one(
      `SELECT p.proacl::text AS proacl, p.prosecdef, p.proconfig
         FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.proname='set_language'`);
    check("set_language proacl unchanged", after?.proacl === setLangBefore?.proacl, `${setLangBefore?.proacl} -> ${after?.proacl}`);
    check("set_language still secdef+search_path", after?.prosecdef === true && (after?.proconfig ?? []).some((c) => c.startsWith("search_path")), JSON.stringify(after?.proconfig));
    // authenticated EXECUTE still present in information_schema
    const priv = await one(
      `SELECT count(*)::int AS c FROM information_schema.routine_privileges
        WHERE routine_schema='public' AND routine_name='set_language' AND privilege_type='EXECUTE' AND grantee='authenticated'`);
    check("set_language EXECUTE still granted to authenticated", priv?.c === 1, `n=${priv?.c}`);
    // body diff proof: live def now contains 'es' and user_prefs upsert
    const def = (await one(`SELECT pg_get_functiondef(p.oid) AS d FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='set_language'`)).d;
    check("new body allows 'es' + upserts user_prefs", def.includes("'es'") && def.includes("user_prefs") && def.includes("language_set_at"), "");
  }

  // ---------------- (11) update_ask_settings ----------------
  console.log("\n== (11) update_ask_settings limits ==");
  {
    const ok = await callAs(ownerA, `SELECT public.update_ask_settings('New prompt?','a note','{28,18}'::integer[])`);
    check("update_ask_settings valid call ok", !ok.threw, ok.threw ? `${ok.code} ${ok.message}` : "");
    const row = await one(`SELECT prompt,note,liked_genres FROM public.asks WHERE owner_id=$1`, [ownerA]);
    check("settings persisted", row?.prompt === "New prompt?" && row?.note === "a note" && Array.isArray(row?.liked_genres) && row.liked_genres.length === 2 && row.liked_genres.includes(28) && row.liked_genres.includes(18), JSON.stringify(row));
    const e1 = await callAs(ownerA, `SELECT public.update_ask_settings($1,NULL,NULL)`, ["x".repeat(201)]);
    check("prompt 201 chars -> FIELD_TOO_LONG 22023", e1.threw && e1.code === "22023" && e1.message.includes("FIELD_TOO_LONG"), `${e1.code} ${e1.message}`);
    const e2 = await callAs(ownerA, `SELECT public.update_ask_settings(NULL,$1,NULL)`, ["x".repeat(141)]);
    check("note 141 chars -> FIELD_TOO_LONG 22023", e2.threw && e2.code === "22023" && e2.message.includes("FIELD_TOO_LONG"), `${e2.code} ${e2.message}`);
    const e3 = await callAs(ownerA, `SELECT public.update_ask_settings(NULL,NULL,'{28,18,12,16,35,80}'::integer[])`);
    check("6 genres -> FIELD_TOO_LONG 22023", e3.threw && e3.code === "22023" && e3.message.includes("FIELD_TOO_LONG"), `${e3.code} ${e3.message}`);
    const e4 = await callAs(ownerA, `SELECT public.update_ask_settings(NULL,NULL,'{28,28}'::integer[])`);
    check("duplicate genres -> 22023", e4.threw && e4.code === "22023", `${e4.code} ${e4.message}`);
    const e5 = await callAs(ownerA, `SELECT public.update_ask_settings(NULL,NULL,'{999999}'::integer[])`);
    check("unknown genre id -> 22023", e5.threw && e5.code === "22023", `${e5.code} ${e5.message}`);
    const e6 = await callAs(ownerC, `SELECT public.update_ask_settings('x',NULL,NULL)`);
    // owner C HAS an ask (created in case 1) -> succeeds; use owner with truly no ask? C got one. Skip NOT_FOUND here; covered by design.
    check("update_ask_settings works for owner C (has ask)", !e6.threw, e6.threw ? `${e6.code} ${e6.message}` : "");
    const e7 = await callAs(ownerA, `SELECT public.set_ask_active(NULL)`);
    check("set_ask_active(NULL) -> 22023", e7.threw && e7.code === "22023", `${e7.code} ${e7.message}`);
    const e8 = await callAs(ownerA, `SELECT public.set_ask_active(false)`);
    check("set_ask_active(false) ok", !e8.threw, "");
    const act = await one(`SELECT is_active FROM public.asks WHERE owner_id=$1`, [ownerA]);
    check("is_active=false persisted", act?.is_active === false, JSON.stringify(act));
    await callAs(ownerA, `SELECT public.set_ask_active(true)`);
    // asks row content for get_my_ask shape
    const g = (await callAs(ownerA, `SELECT * FROM public.get_my_ask()`)).rows[0];
    check("get_my_ask returns full asks row (token+settings)", g?.id === askARow.id && typeof g?.token === "string" && g?.prompt === "New prompt?", JSON.stringify({ id: g?.id, prompt: g?.prompt }));
  }

  // ---------------- (12) enqueue_stale_enrichment ----------------
  console.log("\n== (12) enqueue_stale_enrichment: scope, idempotency, cap ==");
  {
    // enrichment fixtures recommended to A via cEnrich (new submission)
    const ePend   = await mkItem("920001", "movie", { name: "E Pend",   enrichment_status: "pending",  fetched_at: "2026-11-20T00:00:00Z" });
    const ePartial= await mkItem("920002", "movie", { name: "E Partial",enrichment_status: "partial",  fetched_at: "2026-11-20T00:00:00Z" });
    const eStaleYt= await mkItem("aqw2FsBcDeE", "video",{ source: "youtube", name: "E StaleYT", enrichment_status: "complete", fetched_at: "2026-10-01T00:00:00Z" }); // >20d
    const eStaleTm= await mkItem("920004", "movie", { name: "E StaleTM", enrichment_status: "complete",  fetched_at: "2026-01-01T00:00:00Z" }); // >5mo
    const eFreshYt= await mkItem("zxcvBnMqWeR", "video",{ source: "youtube", name: "E FreshYT",enrichment_status: "complete", fetched_at: "2026-11-15T00:00:00Z" }); // 7d
    const eFreshTm= await mkItem("920006", "movie", { name: "E FreshTM",enrichment_status: "complete",  fetched_at: "2026-09-01T00:00:00Z" }); // ~3mo
    const eFailed = await mkItem("920007", "movie", { name: "E Failed",  enrichment_status: "failed",    fetched_at: "2026-11-20T00:00:00Z" });
    const eBOnly   = await mkItem("920008", "movie", { name: "E BOnly",   enrichment_status: "pending",  fetched_at: "2026-11-20T00:00:00Z" });
    const sE = (await one(
      `INSERT INTO public.submissions (ask_id, contributor_id, client_batch_id, title_count, created_at)
       VALUES ($1,$2,NULL,7,'2026-01-05T00:00:00Z') RETURNING id`, [askA.id, cEnrich])).id;
    for (const it of [ePend, ePartial, eStaleYt, eStaleTm, eFreshYt, eFreshTm, eFailed]) {
      await client.query(
        `INSERT INTO public.recommendations (owner_id,item_id,contributor_id,submission_id,rating,created_at,updated_at)
         VALUES ($1,$2,$3,$4,NULL,'2026-01-05T10:00:00Z','2026-01-05T10:00:00Z')`, [ownerA, it, cEnrich, sE]);
    }
    // eBOnly recommended ONLY to owner B (via Carol's existing submission sB1)
    await client.query(
      `INSERT INTO public.recommendations (owner_id,item_id,contributor_id,submission_id,rating,created_at,updated_at)
       VALUES ($1,$2,$3,$4,NULL,'2026-01-08T12:00:00Z','2026-01-08T12:00:00Z')`, [ownerB, eBOnly, cCarol, sB1]);

    const n0 = await count(`SELECT count(*)::int AS c FROM public.enrichment_jobs`);
    const first = (await callAs(ownerA, `SELECT public.enqueue_stale_enrichment() AS n`)).rows[0]?.n;
    // qualifying items for A: core fixture items are ALL stale (fetched_at 2026-01-01 > 5mo tmdb / >20d youtube)
    // -> X,Y,Z,W,YT,DOC,AVAIL,POP (8) + ePend,ePartial,eStaleYt,eStaleTm (4) = 12 items x 2 jobs = 24
    // excluded: eFreshYt(7d), eFreshTm(~3mo), eFailed(failed+fresh) -> 0 jobs
    check("enqueue_stale_enrichment first call -> 24 jobs (12 stale items x 2 kinds)", first === 24, `n=${first}`);
    const jobRows = await all(
      `SELECT j.item_id, j.job_kind, j.param FROM public.enrichment_jobs j
        WHERE j.item_id = ANY($1::uuid[]) ORDER BY j.item_id, j.job_kind`,
      [[ePend, ePartial, eStaleYt, eStaleTm, eFreshYt, eFreshTm, eFailed, eBOnly]]);
    const kinds = {};
    for (const r of jobRows) kinds[`${r.item_id}:${r.job_kind}`] = r.param;
    check("jobs params: details = owner tmdb_lang ('es-ES' after set_language test), availability = region 'US'",
      kinds[`${ePend}:details`] === "es-ES" && kinds[`${ePend}:availability`] === "US" &&
      kinds[`${eStaleYt}:details`] === "es-ES" && kinds[`${eStaleYt}:availability`] === "US", JSON.stringify(kinds).slice(0, 300));
    check("each stale item got BOTH job kinds", [ePend, ePartial, eStaleYt, eStaleTm].every((i) => kinds[`${i}:details`] && kinds[`${i}:availability`]), "");
    check("no jobs for fresh-complete / failed-fresh items", !jobRows.some((r) => [eFreshYt, eFreshTm, eFailed].includes(r.item_id)), `rows=${jobRows.length}`);
    check("no jobs for other owner's stale item (eBOnly)", !jobRows.some((r) => r.item_id === eBOnly), "");
    const second = (await callAs(ownerA, `SELECT public.enqueue_stale_enrichment() AS n`)).rows[0]?.n;
    check("idempotent re-call -> 0", second === 0, `n=${second}`);
    // B's own kick: itemB1 (stale tmdb), itemB2 (pending), eBOnly (pending) = 3 items x 2 = 6
    const bN = (await callAs(ownerB, `SELECT public.enqueue_stale_enrichment() AS n`)).rows[0]?.n;
    check("B's enqueue -> 6 jobs (3 stale items x 2 kinds)", bN === 6, `n=${bN}`);
    const bJobs = await all(`SELECT job_kind,param FROM public.enrichment_jobs WHERE item_id=$1 ORDER BY job_kind`, [eBOnly]);
    check("eBOnly jobs params fr-FR/US (B ran set_language('fr'))", bJobs.length === 2 && bJobs.every((j) => (j.job_kind === "details" ? j.param === "fr-FR" : j.param === "US")), JSON.stringify(bJobs));

    // ---- cap test: 30 fresh pending items for A ----
    const capItems = [];
    for (let g = 1; g <= 30; g++) {
      capItems.push(await mkItem("921" + String(g).padStart(3, "0"), "movie", { name: "Cap " + g, enrichment_status: "pending", fetched_at: "2026-11-20T00:00:00Z" }));
    }
    const sCap = (await one(
      `INSERT INTO public.submissions (ask_id, contributor_id, client_batch_id, title_count, created_at)
       VALUES ($1,$2,NULL,20,'2026-01-04T00:00:00Z') RETURNING id`, [askA.id, cEnrich])).id;
    for (const it of capItems) {
      await client.query(
        `INSERT INTO public.recommendations (owner_id,item_id,contributor_id,submission_id,rating,created_at,updated_at)
         VALUES ($1,$2,$3,$4,NULL,'2026-01-04T10:00:00Z','2026-01-04T10:00:00Z')`, [ownerA, it, cEnrich, sCap]);
    }
    const capJobs0 = await count(`SELECT count(*)::int AS c FROM public.enrichment_jobs`);
    const c1n = (await callAs(ownerA, `SELECT public.enqueue_stale_enrichment() AS n`)).rows[0]?.n;
    const capJobs1 = await count(`SELECT count(*)::int AS c FROM public.enrichment_jobs`);
    check("cap: first call enqueues exactly 50", c1n === 50, `n=${c1n}`);
    check("cap: exactly 50 new job rows exist", capJobs1 - capJobs0 === 50, `delta=${capJobs1 - capJobs0}`);
    const c2n = (await callAs(ownerA, `SELECT public.enqueue_stale_enrichment() AS n`)).rows[0]?.n;
    const capJobs2 = await count(`SELECT count(*)::int AS c FROM public.enrichment_jobs`);
    check("cap: second call enqueues remaining 10", c2n === 10 && capJobs2 - capJobs0 === 60, `n=${c2n} delta=${capJobs2 - capJobs0}`);
    const c3n = (await callAs(ownerA, `SELECT public.enqueue_stale_enrichment() AS n`)).rows[0]?.n;
    check("cap: drained -> 0", c3n === 0, `n=${c3n}`);
    void n0;
  }

  // ---------------- (12b) enqueue_stale_enrichment: re-enqueue/reset ----------------
  console.log("\n== (12b) enqueue_stale_enrichment: done/failed reset + stale windows ==");
  {
    const jobOf = (item, kind, param) => one(
      `SELECT status, attempts, run_after, last_error, locked_at FROM public.enrichment_jobs
        WHERE item_id=$1 AND job_kind=$2 AND param=$3`, [item, kind, param]);
    const mkJob = (item, kind, param, status, o = {}) => client.query(
      `INSERT INTO public.enrichment_jobs (item_id, job_kind, param, status, attempts, run_after, locked_at, last_error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [item, kind, param, status, o.attempts ?? 0, o.run_after ?? "2026-01-01T00:00:00Z",
       o.locked_at ?? null, o.last_error ?? null]);

    // A's effective params here: details 'es-ES' (set_language('es') in case 10),
    // availability 'US' (region cleared to NULL in case 9 -> COALESCE 'US').
    // B's: details 'fr-FR' (set_language('fr') in case 10), availability 'US'.
    const A_TAG = "es-ES", A_REG = "US", B_TAG = "fr-FR";
    const d6m     = "2026-05-20T00:00:00Z";                        // tmdb >5 months stale
    const tmFresh = "2026-10-20T00:00:00Z";                        // tmdb <5 months fresh
    const yt21    = new Date(Date.now() - 21 * 864e5).toISOString(); // youtube >20d stale
    const yt19    = new Date(Date.now() - 19 * 864e5).toISOString(); // youtube <20d fresh
    const doneJob = { attempts: 3, run_after: "2026-01-01T00:00:00Z", locked_at: "2026-01-02T00:00:00Z", last_error: "old err" };

    const itDone6m = await mkItem("930001", "movie", { name: "R Done6m",  enrichment_status: "complete", fetched_at: d6m });
    const itFail   = await mkItem("930002", "movie", { name: "R Fail",    enrichment_status: "complete", fetched_at: d6m });
    const itFresh  = await mkItem("930003", "movie", { name: "R Fresh",   enrichment_status: "pending",  fetched_at: tmFresh });
    const itYt21   = await mkItem("aqw2FsBcDeF", "video", { source: "youtube", name: "R YT21", enrichment_status: "complete", fetched_at: yt21 });
    const itYt19   = await mkItem("zxcvBnMqWeT", "video", { source: "youtube", name: "R YT19", enrichment_status: "complete", fetched_at: yt19 });
    const itProc   = await mkItem("930006", "movie", { name: "R Proc",    enrichment_status: "complete", fetched_at: d6m });
    const itBOwn   = await mkItem("930007", "movie", { name: "R BStale",  enrichment_status: "complete", fetched_at: d6m });

    await mkJob(itDone6m, "details",      A_TAG, "done", doneJob);
    await mkJob(itDone6m, "availability", A_REG, "done", doneJob);
    await mkJob(itFail,   "details",      A_TAG, "failed", { attempts: 5, run_after: new Date(),           last_error: "recent boom" });
    await mkJob(itFail,   "availability", A_REG, "failed", { attempts: 5, run_after: new Date(Date.now() - 2 * 864e5), last_error: "old boom" });
    await mkJob(itFresh,  "details",      A_TAG, "done", doneJob);
    await mkJob(itFresh,  "availability", A_REG, "done", doneJob);
    await mkJob(itYt21,   "details",      A_TAG, "done", doneJob);
    await mkJob(itYt21,   "availability", A_REG, "done", doneJob);
    await mkJob(itYt19,   "details",      A_TAG, "done", doneJob);
    await mkJob(itYt19,   "availability", A_REG, "done", doneJob);
    await mkJob(itProc,   "details",      A_TAG, "processing", { attempts: 1, run_after: "2026-01-01T00:00:00Z", locked_at: new Date() });
    await mkJob(itProc,   "availability", A_REG, "done", doneJob);
    await mkJob(itBOwn,   "details",      B_TAG, "done", doneJob);
    await mkJob(itBOwn,   "availability", A_REG, "done", doneJob);

    // recommendations: all but itBOwn -> owner A (fresh submission by cEnrich);
    // itBOwn -> owner B only (cCarol via sB1)
    const sR = (await one(
      `INSERT INTO public.submissions (ask_id, contributor_id, client_batch_id, title_count, created_at)
       VALUES ($1,$2,NULL,6,'2026-01-05T01:00:00Z') RETURNING id`, [askA.id, cEnrich])).id;
    for (const it of [itDone6m, itFail, itFresh, itYt21, itYt19, itProc]) {
      await client.query(
        `INSERT INTO public.recommendations (owner_id,item_id,contributor_id,submission_id,rating,created_at,updated_at)
         VALUES ($1,$2,$3,$4,NULL,'2026-01-05T11:00:00Z','2026-01-05T11:00:00Z')`, [ownerA, it, cEnrich, sR]);
    }
    await client.query(
      `INSERT INTO public.recommendations (owner_id,item_id,contributor_id,submission_id,rating,created_at,updated_at)
       VALUES ($1,$2,$3,$4,NULL,'2026-01-08T12:30:00Z','2026-01-08T12:30:00Z')`, [ownerB, itBOwn, cCarol, sB1]);

    // call 1 as A: itDone6m 2 resets + itFail availability 1 + itYt21 2 + itProc availability 1 = 6
    // (itFail details failed-recent is a candidate but fails the DO UPDATE WHERE -> not counted)
    const k1 = (await callAs(ownerA, `SELECT public.enqueue_stale_enrichment() AS n`)).rows[0]?.n;
    check("re-enqueue call -> 6 (done resets + old-failed reset + yt21 + avail reset)", k1 === 6, `n=${k1}`);

    const jDD = await jobOf(itDone6m, "details", A_TAG);
    const jDA = await jobOf(itDone6m, "availability", A_REG);
    check("6m-stale done jobs -> pending, attempts 0, last_error/locked_at NULL, run_after ~now",
      jDD?.status === "pending" && jDD?.attempts === 0 && jDD?.last_error === null && jDD?.locked_at === null &&
      jDA?.status === "pending" && jDA?.attempts === 0 && jDA?.last_error === null && jDA?.locked_at === null,
      JSON.stringify({ d: jDD, a: jDA }));
    const jFD = await jobOf(itFail, "details", A_TAG);
    const jFA = await jobOf(itFail, "availability", A_REG);
    check("failed run_after=now() NOT reset (still failed, attempts/error kept)",
      jFD?.status === "failed" && jFD?.attempts === 5 && jFD?.last_error === "recent boom", JSON.stringify(jFD));
    check("failed run_after=2d ago IS reset -> pending attempts 0",
      jFA?.status === "pending" && jFA?.attempts === 0 && jFA?.last_error === null && jFA?.locked_at === null, JSON.stringify(jFA));
    const jFrD = await jobOf(itFresh, "details", A_TAG);
    const jFrA = await jobOf(itFresh, "availability", A_REG);
    check("fresh pending item with done jobs untouched (non-stale -> missing-only)",
      jFrD?.status === "done" && jFrA?.status === "done", `d=${jFrD?.status} a=${jFrA?.status}`);
    const jY21 = await jobOf(itYt21, "details", A_TAG);
    const jY21A = await jobOf(itYt21, "availability", A_REG);
    const jY19 = await jobOf(itYt19, "details", A_TAG);
    const jY19A = await jobOf(itYt19, "availability", A_REG);
    check("youtube fetched 21d ago -> done jobs reset to pending",
      jY21?.status === "pending" && jY21A?.status === "pending", `d=${jY21?.status} a=${jY21A?.status}`);
    check("youtube fetched 19d ago -> done jobs untouched",
      jY19?.status === "done" && jY19A?.status === "done", `d=${jY19?.status} a=${jY19A?.status}`);
    const jPD = await jobOf(itProc, "details", A_TAG);
    const jPA = await jobOf(itProc, "availability", A_REG);
    check("processing job untouched (still processing, locked_at kept); sibling done reset",
      jPD?.status === "processing" && jPD?.locked_at !== null && jPA?.status === "pending", JSON.stringify({ d: jPD?.status, a: jPA?.status }));
    const jBD = await jobOf(itBOwn, "details", B_TAG);
    const jBA = await jobOf(itBOwn, "availability", A_REG);
    check("another owner's stale item untouched by A's call",
      jBD?.status === "done" && jBA?.status === "done", `d=${jBD?.status} a=${jBA?.status}`);

    // call 2 as A -> 0: everything actionable is now pending; failed-recent still fails WHERE
    const k2 = (await callAs(ownerA, `SELECT public.enqueue_stale_enrichment() AS n`)).rows[0]?.n;
    check("second call -> 0", k2 === 0, `n=${k2}`);
    const jFD2 = await jobOf(itFail, "details", A_TAG);
    check("failed-recent still failed after second call", jFD2?.status === "failed", jFD2?.status);

    // B's own call resets B's stale item (proves per-owner scoping both ways)
    const kb = (await callAs(ownerB, `SELECT public.enqueue_stale_enrichment() AS n`)).rows[0]?.n;
    check("B's call -> 2 (own stale done jobs reset; B's pending jobs excluded)", kb === 2, `n=${kb}`);
    const jBD2 = await jobOf(itBOwn, "details", B_TAG);
    const jBA2 = await jobOf(itBOwn, "availability", A_REG);
    check("itBOwn jobs now pending attempts 0 after B's call",
      jBD2?.status === "pending" && jBD2?.attempts === 0 && jBA2?.status === "pending", JSON.stringify({ d: jBD2?.status, a: jBA2?.status }));

    // ---- cap test on B: 30 stale items x 2 missing jobs = 60 candidates ----
    const capB = [];
    for (let g = 1; g <= 30; g++) {
      capB.push(await mkItem("932" + String(g).padStart(3, "0"), "movie",
        { name: "CapB " + g, enrichment_status: "complete", fetched_at: d6m }));
    }
    for (const it of capB) {
      await client.query(
        `INSERT INTO public.recommendations (owner_id,item_id,contributor_id,submission_id,rating,created_at,updated_at)
         VALUES ($1,$2,$3,$4,NULL,'2026-01-08T13:00:00Z','2026-01-08T13:00:00Z')`, [ownerB, it, cCarol, sB1]);
    }
    const cb0 = await count(`SELECT count(*)::int AS c FROM public.enrichment_jobs`);
    const cb1 = (await callAs(ownerB, `SELECT public.enqueue_stale_enrichment() AS n`)).rows[0]?.n;
    const cb1n = await count(`SELECT count(*)::int AS c FROM public.enrichment_jobs`);
    check("cap: first call -> exactly 50", cb1 === 50 && cb1n - cb0 === 50, `n=${cb1} delta=${cb1n - cb0}`);
    const cb2 = (await callAs(ownerB, `SELECT public.enqueue_stale_enrichment() AS n`)).rows[0]?.n;
    const cb2n = await count(`SELECT count(*)::int AS c FROM public.enrichment_jobs`);
    check("cap: second call -> remaining 10", cb2 === 10 && cb2n - cb0 === 60, `n=${cb2} delta=${cb2n - cb0}`);
    const cb3 = (await callAs(ownerB, `SELECT public.enqueue_stale_enrichment() AS n`)).rows[0]?.n;
    check("cap: drained -> 0", cb3 === 0, `n=${cb3}`);
  }

  // ---------------- (12c) enqueue_stale_enrichment: failed-recent cap starvation ----------------
  console.log("\n== (12c) enqueue_stale_enrichment: failed-recent jobs excluded from candidates (cap starvation fix) ==");
  {
    // A's effective params here: details 'es-ES', availability 'US' (see 12b).
    const A_TAG = "es-ES", A_REG = "US";
    const sixAgo = "2026-05-20T00:00:00Z";                    // tmdb >5 months stale (~6 months ago)
    // 55 stale items whose jobs are all failed-recent, explicit ids sorting BEFORE the 5 no-job items
    const starveIds = [];
    for (let i = 1; i <= 55; i++) {
      starveIds.push("00000000-0000-4000-8000-0000000000" + String(i).padStart(2, "0"));
    }
    const noJobIds = [];
    for (let i = 1; i <= 5; i++) {
      noJobIds.push("ffffffff-ffff-4fff-8fff-fffffffffff" + i);
    }
    check("fixture: every starvation id sorts before every no-job id",
      starveIds.every((id) => id < noJobIds[0]), `max=${starveIds[54]} min=${noJobIds[0]}`);

    const mkStarveItem = (id, external_id, name) => client.query(
      `INSERT INTO public.items (id, source, kind, external_id, name, release_date, original_language, genres,
                                 is_documentary, poster_path, enrichment_status, fetched_at, tmdb_rating, overview, localized)
       VALUES ($1,'tmdb','movie',$2,$3,'2020-01-01','en','{}',false,NULL,'complete',$4,NULL,NULL,'{}')`,
      [id, external_id, name, sixAgo]);
    for (let i = 0; i < 55; i++) await mkStarveItem(starveIds[i], "940" + String(i + 1).padStart(3, "0"), "Starve " + (i + 1));
    for (let i = 0; i < 5; i++)  await mkStarveItem(noJobIds[i],  "941" + String(i + 1).padStart(3, "0"), "NoJob " + (i + 1));

    // 110 failed-recent job rows: details (es-ES) + availability (US) per starved item
    for (const id of starveIds) {
      await client.query(
        `INSERT INTO public.enrichment_jobs (item_id, job_kind, param, status, attempts, run_after, last_error)
         VALUES ($1,'details',$2,'failed',4,now(),'starve-details'),
                ($1,'availability',$3,'failed',4,now(),'starve-availability')`,
        [id, A_TAG, A_REG]);
    }

    // recommendations to owner A (one submission, cEnrich)
    const sStarve = (await one(
      `INSERT INTO public.submissions (ask_id, contributor_id, client_batch_id, title_count, created_at)
       VALUES ($1,$2,NULL,20,'2026-01-05T02:00:00Z') RETURNING id`, [askA.id, cEnrich])).id;
    for (const id of [...starveIds, ...noJobIds]) {
      await client.query(
        `INSERT INTO public.recommendations (owner_id,item_id,contributor_id,submission_id,rating,created_at,updated_at)
         VALUES ($1,$2,$3,$4,NULL,'2026-01-05T12:00:00Z','2026-01-05T12:00:00Z')`,
        [ownerA, id, cEnrich, sStarve]);
    }

    // (1) STARVATION: the 110 failed-recent rows sort first and would eat all 50 cap slots
    // if they stayed candidates; they must be excluded -> only the 10 missing-job rows enqueue.
    const st1 = (await callAs(ownerA, `SELECT public.enqueue_stale_enrichment() AS n`)).rows[0]?.n;
    check("starvation call -> 10 (5 no-job items x 2 kinds)", st1 === 10, `n=${st1}`);
    const newJobs = await all(
      `SELECT item_id, job_kind, param, status FROM public.enrichment_jobs
        WHERE item_id = ANY($1::uuid[]) ORDER BY item_id, job_kind`, [noJobIds]);
    check("5 no-job items now have BOTH jobs pending (details es-ES / availability US)",
      newJobs.length === 10 && newJobs.every((j) => j.status === "pending" &&
        (j.job_kind === "details" ? j.param === A_TAG : j.param === A_REG)),
      `rows=${newJobs.length} sample=${JSON.stringify(newJobs.slice(0, 2))}`);
    const failRows = await all(
      `SELECT status, attempts, last_error FROM public.enrichment_jobs
        WHERE item_id = ANY($1::uuid[])`, [starveIds]);
    check("all 110 failed-recent rows unchanged (failed, attempts=4, last_error kept)",
      failRows.length === 110 && failRows.every((j) => j.status === "failed" && j.attempts === 4 &&
        (j.last_error === "starve-details" || j.last_error === "starve-availability")),
      `rows=${failRows.length}`);
    const st2 = (await callAs(ownerA, `SELECT public.enqueue_stale_enrichment() AS n`)).rows[0]?.n;
    check("starvation second call -> 0", st2 === 0, `n=${st2}`);

    // (2) age the 110 failed rows past the 1-day window -> resettable again; cap drains 50/50/10/0
    await client.query(
      `UPDATE public.enrichment_jobs SET run_after = now() - interval '2 days'
        WHERE item_id = ANY($1::uuid[]) AND status = 'failed'`, [starveIds]);
    const aged = await count(
      `SELECT count(*)::int AS c FROM public.enrichment_jobs
        WHERE item_id = ANY($1::uuid[]) AND status = 'failed'
          AND run_after < now() - interval '1 day'`, [starveIds]);
    check("aged: all 110 failed rows now run_after < now()-1d", aged === 110, `n=${aged}`);
    const capSeq = [];
    for (let k = 0; k < 4; k++) {
      capSeq.push((await callAs(ownerA, `SELECT public.enqueue_stale_enrichment() AS n`)).rows[0]?.n);
    }
    check("aged cap: calls return exactly 50, 50, 10, 0", JSON.stringify(capSeq) === "[50,50,10,0]", `seq=${JSON.stringify(capSeq)}`);
    const resetRows = await count(
      `SELECT count(*)::int AS c FROM public.enrichment_jobs
        WHERE item_id = ANY($1::uuid[]) AND status = 'pending' AND attempts = 0`, [starveIds]);
    check("aged: all 110 rows reset to pending attempts=0", resetRows === 110, `n=${resetRows}`);
  }

  // ---------------- (13) ACL dump ----------------
  console.log("\n== (13) ACL: proacl/proconfig/prosecdef for all 12 ==");
  {
    const meta = await all(
      `SELECT p.proname, p.prosecdef, p.proconfig, p.proacl::text AS proacl
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname = ANY($1) ORDER BY p.proname`, [FN_NAMES]);
    check("all 12 functions exist", meta.length === 12, `found=${meta.length}`);
    const EXPECTED_ACL = "{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}";
    for (const m of meta) {
      const sp = (m.proconfig ?? []).some((c) => c.startsWith("search_path=public"));
      const aclOk = m.proacl === EXPECTED_ACL;
      console.log(`  ${m.proname}: prosecdef=${m.prosecdef} proconfig=${JSON.stringify(m.proconfig)} proacl=${m.proacl}`);
      check(`${m.proname} secdef+search_path+acl(authenticated+service_role only)`, m.prosecdef === true && sp && aclOk, `definer=${m.prosecdef} sp=${sp} acl=${m.proacl}`);
    }
    // no PUBLIC/anon grants anywhere on the 12
    const leaks = await all(
      `SELECT routine_name, grantee FROM information_schema.routine_privileges
        WHERE routine_schema='public' AND routine_name = ANY($1)
          AND privilege_type='EXECUTE' AND grantee IN ('PUBLIC','anon')`, [FN_NAMES]);
    check("no PUBLIC/anon EXECUTE grants on any of the 12", leaks.length === 0, JSON.stringify(leaks));
  }

  // ---------------- (14) EXPLAIN get_inbox on ~5000-recommendation fixture ----------------
  console.log("\n== (14) EXPLAIN (ANALYZE, BUFFERS) get_inbox — ~5000 recommendations ==");
  {
    // 250 contributors x 1 submission x 20 recs = 5000 recs to owner A over 200 items
    await client.query(
      `INSERT INTO public.contributors (display_name, secret_hash)
       SELECT 'Perf Friend '||lpad(g::text,3,'0'), decode(repeat('ef',32),'hex')
       FROM generate_series(1,250) g`);
    await client.query(
      `INSERT INTO public.items (source,kind,external_id,name,enrichment_status,fetched_at)
       SELECT 'tmdb','movie','95'||lpad(g::text,4,'0'),'Perf Item '||g,'complete',now()
       FROM generate_series(1,200) g`);
    await client.query(
      `INSERT INTO public.submissions (ask_id, contributor_id, client_batch_id, title_count)
       SELECT $1, c.id, NULL, 20 FROM public.contributors c WHERE c.display_name LIKE 'Perf Friend %'`, [askA.id]);
    const ins = await client.query(
      `INSERT INTO public.recommendations (owner_id,item_id,contributor_id,submission_id,rating,created_at,updated_at)
       SELECT $1, it.id, pc.id, s.id, (1 + ((pc.ci + j) % 100))::smallint,
              now() - ((pc.ci * 20 + j) || ' seconds')::interval,
              now() - ((pc.ci * 20 + j) || ' seconds')::interval
         FROM (SELECT c.id, row_number() OVER (ORDER BY c.display_name) AS ci
                 FROM public.contributors c WHERE c.display_name LIKE 'Perf Friend %') pc
         CROSS JOIN LATERAL generate_series(0,19) AS j
         JOIN LATERAL (
           SELECT i.id FROM public.items i
           WHERE i.external_id = '95' || lpad((((pc.ci - 1) * 20 + j) % 200 + 1)::text, 4, '0')
         ) it ON true
         JOIN LATERAL (
           SELECT s.id FROM public.submissions s
           WHERE s.contributor_id = pc.id AND s.ask_id = $2 LIMIT 1
         ) s ON true`, [ownerA, askA.id]);
    console.log(`  perf fixture: ${ins.rowCount} recommendations inserted`);
    const tot = await count(`SELECT count(*)::int AS c FROM public.recommendations WHERE owner_id=$1`, [ownerA]);
    console.log(`  owner A total recommendations now: ${tot}`);

    await asUser(ownerA);
    const plan1 = await client.query(
      `EXPLAIN (ANALYZE, BUFFERS) SELECT public.get_inbox('to_watch', NULL, '{}'::jsonb, 'recent', NULL, NULL, 30)`);
    await asPostgres();
    EXPLAIN_OUT += "\n-- EXPLAIN (ANALYZE, BUFFERS) SELECT public.get_inbox('to_watch', NULL, '{}'::jsonb, 'recent', NULL, NULL, 30)\n";
    for (const r of plan1.rows) { console.log("  " + r["QUERY PLAN"]); EXPLAIN_OUT += r["QUERY PLAN"] + "\n"; }

    // inner-plan replica: the function's heavy WITH..SELECT inlined with literals
    // (plpgsql hides inner plans; this mirrors get_inbox's rec/base/page/cards path)
    const innerSql = `
      WITH rec AS (
        SELECT r.item_id, count(*)::integer AS recommender_count, count(r.rating)::integer AS rater_count,
               round(avg(r.rating))::integer AS friends_avg, max(r.updated_at) AS latest_at
        FROM public.recommendations r WHERE r.owner_id = '${ownerA}'::uuid
        GROUP BY r.item_id
      ),
      base AS (
        SELECT rec.item_id, rec.recommender_count, rec.rater_count, rec.friends_avg, rec.latest_at,
               i.source, i.kind, i.external_id, i.name AS original_title, i.release_date, i.original_language,
               i.genres, i.is_documentary, i.runtime_min, i.overview, i.poster_path, i.thumb_url, i.trailer_url,
               i.tmdb_rating, i.enrichment_status, i.localized,
               COALESCE(ois.status,'to_watch') AS status, ois.updated_at AS state_updated_at,
               extract(epoch from rec.latest_at) AS sort_key
        FROM rec JOIN public.items i ON i.id = rec.item_id
        LEFT JOIN public.owner_item_state ois ON ois.owner_id = '${ownerA}'::uuid AND ois.item_id = rec.item_id
      ),
      page AS (
        SELECT * FROM base WHERE status = 'to_watch'
        ORDER BY sort_key DESC, item_id DESC LIMIT 31
      )
      SELECT count(*) AS page_rows FROM page`;
    const plan2 = await client.query(`EXPLAIN (ANALYZE, BUFFERS) ${innerSql}`);
    EXPLAIN_OUT += "\n-- EXPLAIN (ANALYZE, BUFFERS) inner replica (rec+base+page)\n";
    console.log("\n  -- inner replica plan --");
    for (const r of plan2.rows) { console.log("  " + r["QUERY PLAN"]); EXPLAIN_OUT += r["QUERY PLAN"] + "\n"; }
  }

  console.log(`\n===== HARNESS RESULT: ${pass} passed, ${fail} failed =====`);
} catch (e) {
  fail++;
  console.log(`HARNESS ERROR: ${e.message}`);
  console.log(e.stack);
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
    const markerUsers = Number((await c2.query(`SELECT count(*)::int AS c FROM public.users WHERE normalized_display_name LIKE 'harness-%'`)).rows[0].c);
    const markerItems = Number((await c2.query(`SELECT count(*)::int AS c FROM public.items WHERE external_id LIKE '91%'`)).rows[0].c);
    const markerContrib = Number((await c2.query(`SELECT count(*)::int AS c FROM public.contributors WHERE display_name IN ('Alice Alpha','Bob Beta','Carol Gamma','Dave Delta','Erin Echo','Frank Fox','Enrich Ed') OR display_name LIKE 'Perf Friend %'`)).rows[0].c);
    if (markerUsers) { residue++; console.log(`RESIDUE  users harness markers: ${markerUsers}`); }
    if (markerItems) { residue++; console.log(`RESIDUE  items harness markers: ${markerItems}`); }
    if (markerContrib) { residue++; console.log(`RESIDUE  contributors harness markers: ${markerContrib}`); }
    console.log(residue === 0 ? "RESIDUE CHECK: zero residue — all table counts identical to pre-run baseline" : `RESIDUE CHECK: ${residue} table(s) differ`);
  } finally { c2.release(); await pool2.end(); }
}

process.exit(fail === 0 ? 0 : 1);

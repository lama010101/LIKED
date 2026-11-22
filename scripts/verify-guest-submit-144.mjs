// verify-guest-submit-144.mjs — rollback harness for migration 144
// (V2-W2-P0-03, PLAN P0-03): guest/submit class-S functions.
//
// Runs the migration SQL file text inside ONE transaction against
// DATABASE_URL, executes every acceptance case, and ALWAYS issues
// ROLLBACK in a finally block. The script refuses to run if the
// migration file contains a COMMIT (or other transaction-control)
// statement. Nothing is ever committed.
//
// Usage: node scripts/verify-guest-submit-144.mjs

import { config } from "dotenv";
import { readFileSync } from "fs";
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
if (!process.env.DATABASE_URL) {
  console.error("ABORT: DATABASE_URL is not set");
  process.exit(3);
}

const MIGRATION = join(root, "supabase", "migrations", "144_v2_guest_submit.sql");
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
// Used for every expected-error call so the outer transaction survives.
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

const FN_ARGS = {
  guest_get_ask:                  ["SELECT * FROM public.guest_get_ask($1)", ["x"]],
  guest_create_contributor:       ["SELECT public.guest_create_contributor($1, $2)", ["Al", Buffer.alloc(32, 0x61)]],
  guest_rename:                   ["SELECT public.guest_rename($1, $2)", [randomUUID(), "Al"]],
  guest_touch:                    ["SELECT public.guest_touch($1)", [randomUUID()]],
  guest_verify:                   ["SELECT public.guest_verify($1)", [randomUUID()]],
  submit_recommendations:         ["SELECT public.submit_recommendations($1,$2,$3,$4::jsonb)", ["x", randomUUID(), randomUUID(), "[]"]],
  guest_get_receipt:              ["SELECT * FROM public.guest_get_receipt($1,$2)", ["x", randomUUID()]],
  delete_guest_data:              ["SELECT public.delete_guest_data($1)", [randomUUID()]],
  upsert_item:                    ["SELECT * FROM public.upsert_item($1,$2,$3,$4::jsonb)", ["tmdb", "movie", "1", "{}"]],
};
const FN_NAMES = Object.keys(FN_ARGS);

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

try {
  await client.query("BEGIN");
  console.log("== applying migration 144 inside transaction ==");
  await client.query(sqlText);
  console.log("migration applied (uncommitted)");

  // ---------------- fixtures ----------------
  const ownerA = (await one(
    `INSERT INTO public.users (display_name, normalized_display_name, avatar_key)
     VALUES ('Harness Owner A', 'harness-owner-a-144', 'avatar/harness-a.png') RETURNING id`)).id;
  const ownerB = (await one(
    `INSERT INTO public.users (display_name, normalized_display_name)
     VALUES ('Harness Owner B', 'harness-owner-b-144') RETURNING id`)).id;
  await client.query(
    `INSERT INTO public.user_prefs (user_id, region_code, tmdb_lang, notify_email)
     VALUES ($1, 'FR', 'fr-FR', true)`, [ownerA]);

  const tokenA = "harness-tok-A-" + "a".repeat(48);
  const tokenB = "harness-tok-B-" + "b".repeat(48);
  const askA = (await one(
    `INSERT INTO public.asks (owner_id, token, prompt, note, liked_genres, is_active)
     VALUES ($1, $2, 'Prompt A?', 'Note A', '{28,18}'::integer[], true) RETURNING id`, [ownerA, tokenA])).id;
  const askB = (await one(
    `INSERT INTO public.asks (owner_id, token, is_active)
     VALUES ($1, $2, true) RETURNING id`, [ownerB, tokenB])).id;

  const itemA = (await one(
    `INSERT INTO public.items (source,kind,external_id,name,release_date,poster_path,enrichment_status,fetched_at)
     VALUES ('tmdb','movie','900001','Harness Film A','2020-01-01','/a.jpg','pending', now()) RETURNING id`)).id;
  const itemB = (await one(
    `INSERT INTO public.items (source,kind,external_id,name,release_date,enrichment_status)
     VALUES ('tmdb','movie','900002','Harness Film B','2021-02-02','pending') RETURNING id`)).id;
  const itemC = (await one(
    `INSERT INTO public.items (source,kind,external_id,name,enrichment_status)
     VALUES ('tmdb','series','900003','Harness Series C','pending') RETURNING id`)).id;

  const mkContrib = async (name, hashByte) => (await one(
    `INSERT INTO public.contributors (display_name, secret_hash)
     VALUES ($1, decode(repeat($2,32),'hex')) RETURNING id`, [name, hashByte])).id;
  const cAtomic   = await mkContrib("Harness Atomic", "aa");
  const cOne      = await mkContrib("Harness One", "bb");
  const cTwo      = await mkContrib("Harness Two", "cc");
  const cRating   = await mkContrib("Harness Rating", "dd");
  const cCap      = await mkContrib("Harness Cap", "ee");
  const cBlocked  = await mkContrib("Harness Blocked", "ff");
  const cSelf     = await mkContrib("Harness Self", "11");
  const cDelete   = await mkContrib("Harness Delete", "22");
  const cFn       = await mkContrib("Harness Fn", "33");
  await client.query(
    `UPDATE public.contributors SET claimed_by_user_id=$1, claimed_at=now() WHERE id=$2`, [ownerA, cSelf]);
  await client.query(
    `INSERT INTO public.owner_contributor_blocks (owner_id, contributor_id) VALUES ($1,$2)`, [ownerA, cBlocked]);
  // daily-cap fixture: 5 submissions x 20 titles = 100 in the last 24h
  await client.query(
    `INSERT INTO public.submissions (ask_id, contributor_id, client_batch_id, title_count)
     SELECT $1, $2, NULL, 20 FROM generate_series(1,5)`, [askA, cCap]);

  // impersonate service_role for all function calls
  await client.query(`SELECT set_config('request.jwt.claim.role','service_role',true)`);

  // ---------------- case: class-S function sanity ----------------
  console.log("\n== case: guest_* function sanity ==");
  {
    const r = await trySql(`SELECT public.guest_create_contributor($1,$2) AS id`, ["  Harness Fn Two  ", Buffer.alloc(32, 0x44)]);
    check("guest_create_contributor returns uuid", !r.threw && !!r.rows[0]?.id, r.threw ? `${r.code} ${r.message}` : r.rows[0]?.id);
    const cid = r.rows[0]?.id;
    const nm = await one(`SELECT display_name FROM public.contributors WHERE id=$1`, [cid]);
    check("guest_create_contributor stores trimmed name", nm?.display_name === "Harness Fn Two", JSON.stringify(nm));
    const bad = await trySql(`SELECT public.guest_create_contributor($1,$2)`, ["x", Buffer.alloc(32, 0x45)]);
    check("guest_create_contributor 1-char name -> FIELD_TOO_LONG", bad.threw && bad.code === "22023" && bad.message.includes("FIELD_TOO_LONG"), `${bad.code} ${bad.message}`);
    if (cid) {
      const h = await one(`SELECT public.guest_verify($1) AS h`, [cid]);
      check("guest_verify returns 32-byte hash", Buffer.isBuffer(h.h) && h.h.length === 32, `len=${h.h?.length}`);
      const vi = await trySql(`SELECT public.guest_verify($1)`, [randomUUID()]);
      check("guest_verify missing -> CONTRIBUTOR_INVALID", vi.threw && vi.code === "P0001" && vi.message.includes("CONTRIBUTOR_INVALID"), `${vi.code} ${vi.message}`);
      await client.query(`SELECT public.guest_rename($1,$2)`, [cid, "Harness Fn Renamed"]);
      const nm2 = await one(`SELECT display_name FROM public.contributors WHERE id=$1`, [cid]);
      check("guest_rename updates name", nm2?.display_name === "Harness Fn Renamed", JSON.stringify(nm2));
      await client.query(`UPDATE public.contributors SET last_seen_at='2020-01-01T00:00:00Z' WHERE id=$1`, [cid]);
      await client.query(`SELECT public.guest_touch($1)`, [cid]);
      const ls = await one(`SELECT last_seen_at FROM public.contributors WHERE id=$1`, [cid]);
      check("guest_touch bumps last_seen_at", new Date(ls.last_seen_at) > new Date("2020-01-02"), ls.last_seen_at);
      await client.query(`DELETE FROM public.contributors WHERE id=$1`, [cid]); // keep fixture set clean
    }
    const ga = await all(`SELECT * FROM public.guest_get_ask($1)`, [tokenA]);
    check("guest_get_ask returns landing row", ga.length === 1 && ga[0].owner_display_name === "Harness Owner A" && ga[0].owner_has_visible_picks === false && !("owner_id" in ga[0]), JSON.stringify(ga[0] ?? null));
    const gab = await trySql(`SELECT * FROM public.guest_get_ask($1)`, ["no-such-token-" + "z".repeat(40)]);
    check("guest_get_ask bad token -> ASK_NOT_ACTIVE", gab.threw && gab.code === "P0001" && gab.message.includes("ASK_NOT_ACTIVE"), `${gab.code} ${gab.message}`);
  }

  // ---------------- (a) atomicity ----------------
  console.log("\n== (a) atomicity: 1 valid + 1 invalid item ==");
  {
    const badItem = randomUUID();
    const r = await trySql(
      `SELECT public.submit_recommendations($1,$2,$3,$4::jsonb)`,
      [tokenA, cAtomic, randomUUID(), JSON.stringify([
        { item_id: itemA, rating: 70, platform: "Netflix", comment: "ok" },
        { item_id: badItem, rating: 10 },
      ])]);
    check("submit 1 valid + 1 invalid -> INVALID_ITEM", r.threw && r.code === "22023" && r.message.includes("INVALID_ITEM"), `${r.code} ${r.message}`);
    const nSub = await count(`SELECT count(*)::int AS c FROM public.submissions WHERE contributor_id=$1`, [cAtomic]);
    const nRec = await count(`SELECT count(*)::int AS c FROM public.recommendations WHERE contributor_id=$1`, [cAtomic]);
    const nNot = await count(`SELECT count(*)::int AS c FROM public.notifications WHERE payload->>'contributor_id'=$1`, [cAtomic]);
    const nJob = await count(`SELECT count(*)::int AS c FROM public.enrichment_jobs`);
    const nMail = await count(`SELECT count(*)::int AS c FROM public.email_outbox`);
    check("atomicity: zero submissions", nSub === 0, `n=${nSub}`);
    check("atomicity: zero recommendations", nRec === 0, `n=${nRec}`);
    check("atomicity: zero notifications", nNot === 0, `n=${nNot}`);
    check("atomicity: zero enrichment_jobs", nJob === 0, `n=${nJob}`);
    check("atomicity: zero email_outbox", nMail === 0, `n=${nMail}`);
  }

  // ---------------- (b) idempotency ----------------
  console.log("\n== (b) same batch id twice -> replayed ==");
  let batchB, subB1, subB2;
  {
    batchB = randomUUID();
    const items = JSON.stringify([
      { item_id: itemA, rating: 80, platform: "Netflix", comment: "great" },
      { item_id: itemB, rating: null },
    ]);
    const r1 = await one(`SELECT public.submit_recommendations($1,$2,$3,$4::jsonb) AS j`, [tokenA, cOne, batchB, items]);
    const r2 = await one(`SELECT public.submit_recommendations($1,$2,$3,$4::jsonb) AS j`, [tokenA, cOne, batchB, items]);
    subB1 = r1.j; subB2 = r2.j;
    check("first submit replayed=false accepted=2", subB1?.replayed === false && subB1?.accepted === 2, JSON.stringify(subB1));
    check("second submit replayed=true same submission_id", subB2?.replayed === true && subB2?.submission_id === subB1?.submission_id, JSON.stringify(subB2));
    const nSub = await count(`SELECT count(*)::int AS c FROM public.submissions WHERE contributor_id=$1 AND client_batch_id=$2`, [cOne, batchB]);
    const nNot = await count(`SELECT count(*)::int AS c FROM public.notifications WHERE payload->>'contributor_id'=$1`, [cOne]);
    const nRec = await count(`SELECT count(*)::int AS c FROM public.recommendations WHERE contributor_id=$1`, [cOne]);
    check("idempotent: 1 submission row", nSub === 1, `n=${nSub}`);
    check("idempotent: 1 notification row", nNot === 1, `n=${nNot}`);
    check("idempotent: 2 recommendation rows", nRec === 2, `n=${nRec}`);
  }

  // ---------------- (c) 2 contributors + same item ----------------
  console.log("\n== (c) 2 contributors + same item -> 2 rows ==");
  {
    const r = await one(`SELECT public.submit_recommendations($1,$2,$3,$4::jsonb) AS j`,
      [tokenA, cTwo, randomUUID(), JSON.stringify([{ item_id: itemA, rating: 50 }])]);
    check("second contributor submit ok", r.j?.replayed === false, JSON.stringify(r.j));
    const rows = await all(
      `SELECT contributor_id FROM public.recommendations WHERE owner_id=$1 AND item_id=$2`, [ownerA, itemA]);
    const distinct = new Set(rows.map((x) => x.contributor_id));
    check("same item -> 2 recommendation rows (distinct contributors)", rows.length === 2 && distinct.size === 2 && distinct.has(cOne) && distinct.has(cTwo), `rows=${rows.length} distinct=${distinct.size}`);
  }

  // ---------------- (d) rating edge cases ----------------
  console.log("\n== (d) rating validation ==");
  {
    for (const [label, rating] of [["101", 101], ["-1", -1], ["1.5", 1.5]]) {
      const r = await trySql(`SELECT public.submit_recommendations($1,$2,$3,$4::jsonb)`,
        [tokenA, cRating, randomUUID(), JSON.stringify([{ item_id: itemA, rating }])]);
      check(`rating ${label} -> INVALID_RATING`, r.threw && r.code === "22023" && r.message.includes("INVALID_RATING"), `${r.code} ${r.message}`);
    }
    await one(`SELECT public.submit_recommendations($1,$2,$3,$4::jsonb) AS j`,
      [tokenA, cRating, randomUUID(), JSON.stringify([{ item_id: itemA, rating: 0 }])]);
    const r0 = await one(`SELECT rating FROM public.recommendations WHERE contributor_id=$1 AND item_id=$2`, [cRating, itemA]);
    check("rating 0 stored as 0", r0 && r0.rating === 0, JSON.stringify(r0));
    await one(`SELECT public.submit_recommendations($1,$2,$3,$4::jsonb) AS j`,
      [tokenA, cRating, randomUUID(), JSON.stringify([{ item_id: itemB, rating: null }])]);
    const rn = await one(`SELECT rating FROM public.recommendations WHERE contributor_id=$1 AND item_id=$2`, [cRating, itemB]);
    check("rating null stored NULL", rn && rn.rating === null, JSON.stringify(rn));
  }

  // ---------------- (e) caps + authz errors ----------------
  console.log("\n== (e) limits and error codes ==");
  {
    const many = JSON.stringify(Array.from({ length: 21 }, () => ({ item_id: itemA })));
    const r21 = await trySql(`SELECT public.submit_recommendations($1,$2,$3,$4::jsonb)`, [tokenA, cOne, randomUUID(), many]);
    check("21 items -> TOO_MANY_ITEMS", r21.threw && r21.code === "22023" && r21.message.includes("TOO_MANY_ITEMS"), `${r21.code} ${r21.message}`);
    const r0 = await trySql(`SELECT public.submit_recommendations($1,$2,$3,$4::jsonb)`, [tokenA, cOne, randomUUID(), "[]"]);
    check("0 items -> EMPTY_BATCH", r0.threw && r0.code === "22023" && r0.message.includes("EMPTY_BATCH"), `${r0.code} ${r0.message}`);
    const rCap = await trySql(`SELECT public.submit_recommendations($1,$2,$3,$4::jsonb)`,
      [tokenA, cCap, randomUUID(), JSON.stringify([{ item_id: itemA }])]);
    check("daily cap (100 used + 1) -> DAILY_CAP", rCap.threw && rCap.code === "P0001" && rCap.message.includes("DAILY_CAP"), `${rCap.code} ${rCap.message}`);
    const rBlk = await trySql(`SELECT public.submit_recommendations($1,$2,$3,$4::jsonb)`,
      [tokenA, cBlocked, randomUUID(), JSON.stringify([{ item_id: itemA }])]);
    check("blocked contributor -> CONTRIBUTOR_BLOCKED", rBlk.threw && rBlk.code === "P0001" && rBlk.message.includes("CONTRIBUTOR_BLOCKED"), `${rBlk.code} ${rBlk.message}`);
    const rSelf = await trySql(`SELECT public.submit_recommendations($1,$2,$3,$4::jsonb)`,
      [tokenA, cSelf, randomUUID(), JSON.stringify([{ item_id: itemA }])]);
    check("owner's own contributor -> SELF_RECOMMEND", rSelf.threw && rSelf.code === "P0001" && rSelf.message.includes("SELF_RECOMMEND"), `${rSelf.code} ${rSelf.message}`);
    const rBad = await trySql(`SELECT public.submit_recommendations($1,$2,$3,$4::jsonb)`,
      ["no-such-token-" + "y".repeat(40), cOne, randomUUID(), JSON.stringify([{ item_id: itemA }])]);
    check("submit bad token -> ASK_NOT_ACTIVE", rBad.threw && rBad.code === "P0001" && rBad.message.includes("ASK_NOT_ACTIVE"), `${rBad.code} ${rBad.message}`);
    const rBadC = await trySql(`SELECT public.submit_recommendations($1,$2,$3,$4::jsonb)`,
      [tokenA, randomUUID(), randomUUID(), JSON.stringify([{ item_id: itemA }])]);
    check("submit unknown contributor -> CONTRIBUTOR_INVALID", rBadC.threw && rBadC.code === "P0001" && rBadC.message.includes("CONTRIBUTOR_INVALID"), `${rBadC.code} ${rBadC.message}`);
    await client.query(`UPDATE public.asks SET is_active=false WHERE id=$1`, [askA]);
    const rDis = await trySql(`SELECT * FROM public.guest_get_ask($1)`, [tokenA]);
    check("disabled ask -> ASK_NOT_ACTIVE", rDis.threw && rDis.code === "P0001" && rDis.message.includes("ASK_NOT_ACTIVE"), `${rDis.code} ${rDis.message}`);
    await client.query(`UPDATE public.asks SET is_active=true WHERE id=$1`, [askA]);
  }

  // ---------------- (f) receipt isolation ----------------
  console.log("\n== (f) guest_get_receipt isolation ==");
  {
    const rec1 = await all(`SELECT * FROM public.guest_get_receipt($1,$2)`, [tokenA, cOne]);
    const ids1 = rec1.map((r) => r.item_id).sort();
    check("receipt(cOne) returns only own items", rec1.length === 2 && ids1.includes(itemA) && ids1.includes(itemB), JSON.stringify(ids1));
    const recA = rec1.find((r) => r.item_id === itemA);
    check("receipt(cOne,itemA) rating=80 platform=Netflix", recA?.rating === 80 && recA?.platform_text === "Netflix", JSON.stringify(recA));
    const rec2 = await all(`SELECT * FROM public.guest_get_receipt($1,$2)`, [tokenA, cTwo]);
    check("receipt(cTwo) returns only own item", rec2.length === 1 && rec2[0].item_id === itemA && rec2[0].rating === 50, JSON.stringify(rec2));
    const recB = await all(`SELECT * FROM public.guest_get_receipt($1,$2)`, [tokenB, cOne]);
    check("receipt(tokenB, cOne) -> 0 rows (cross-owner isolation)", recB.length === 0, `rows=${recB.length}`);
    const rBad = await trySql(`SELECT * FROM public.guest_get_receipt($1,$2)`, ["no-such-token-" + "x".repeat(40), cOne]);
    check("receipt bad token -> ASK_NOT_ACTIVE", rBad.threw && rBad.code === "P0001" && rBad.message.includes("ASK_NOT_ACTIVE"), `${rBad.code} ${rBad.message}`);
    const rBadC = await trySql(`SELECT * FROM public.guest_get_receipt($1,$2)`, [tokenA, randomUUID()]);
    check("receipt unknown contributor -> CONTRIBUTOR_INVALID", rBadC.threw && rBadC.code === "P0001" && rBadC.message.includes("CONTRIBUTOR_INVALID"), `${rBadC.code} ${rBadC.message}`);
  }

  // ---------------- (g) delete_guest_data ----------------
  console.log("\n== (g) delete_guest_data ==");
  {
    await one(`SELECT public.submit_recommendations($1,$2,$3,$4::jsonb) AS j`,
      [tokenA, cDelete, randomUUID(), JSON.stringify([{ item_id: itemC, rating: 70, comment: "bye" }])]);
    await client.query(
      `INSERT INTO public.youtube_search_budget (day, scope, used)
       VALUES ((now() AT TIME ZONE 'America/Los_Angeles')::date, 'c:'||$1::text, 5),
              ((now() AT TIME ZONE 'America/Los_Angeles')::date, 'global_search', 9)`, [cDelete]);
    const d1 = await one(`SELECT public.delete_guest_data($1) AS j`, [cDelete]);
    check("delete_guest_data first call {deleted:true}", d1.j?.deleted === true, JSON.stringify(d1.j));
    const goneC = await count(`SELECT count(*)::int AS c FROM public.contributors WHERE id=$1`, [cDelete]);
    const goneS = await count(`SELECT count(*)::int AS c FROM public.submissions WHERE contributor_id=$1`, [cDelete]);
    const goneR = await count(`SELECT count(*)::int AS c FROM public.recommendations WHERE contributor_id=$1`, [cDelete]);
    const goneN = await count(`SELECT count(*)::int AS c FROM public.notifications WHERE payload->>'contributor_id'=$1`, [cDelete]);
    const goneB = await count(`SELECT count(*)::int AS c FROM public.youtube_search_budget WHERE scope='c:'||$1::text`, [cDelete]);
    const keepB = await count(`SELECT count(*)::int AS c FROM public.youtube_search_budget WHERE scope='global_search'`);
    const keepN = await count(`SELECT count(*)::int AS c FROM public.notifications WHERE payload->>'contributor_id'=$1`, [cOne]);
    check("cascade: contributor gone", goneC === 0, `n=${goneC}`);
    check("cascade: submissions gone", goneS === 0, `n=${goneS}`);
    check("cascade: recommendations gone", goneR === 0, `n=${goneR}`);
    check("purge: recommendation_received notifications gone", goneN === 0, `n=${goneN}`);
    check("purge: youtube_search_budget c:<id> gone", goneB === 0, `n=${goneB}`);
    check("kept: global_search budget row survives", keepB === 1, `n=${keepB}`);
    check("kept: other contributor's notification survives", keepN === 1, `n=${keepN}`);
    const d2 = await one(`SELECT public.delete_guest_data($1) AS j`, [cDelete]);
    check("delete_guest_data second call {deleted:false}", d2.j?.deleted === false, JSON.stringify(d2.j));
    const d3 = await one(`SELECT public.delete_guest_data($1) AS j`, [randomUUID()]);
    check("delete_guest_data unknown id {deleted:false}", d3.j?.deleted === false, JSON.stringify(d3.j));
  }

  // ---------------- (h) upsert_item ----------------
  console.log("\n== (h) upsert_item whitelist + idempotency ==");
  {
    const base = JSON.stringify({
      name: "Upsert Flick", release_date: "2019-05-05", original_language: "en",
      genres: ["tmdb:28"], is_documentary: false, overview: "ov", runtime_min: 95,
      poster_path: "/up.jpg", tmdb_rating: 7.5, tmdb_votes: 123,
      fetched_at: "2020-03-03T00:00:00Z",
      // fabricated fields that must be ignored:
      id: "00000000-0000-0000-0000-000000000000", source: "youtube", kind: "video",
      external_id: "hackme12345", created_at: "1999-01-01T00:00:00Z",
      display_status: "unavailable", enrichment_status: "complete",
      localized: { "en-US": { name: "FABRICATED" } }, owner_id: "x",
    });
    const r1 = await one(`SELECT * FROM public.upsert_item($1,$2,$3,$4::jsonb)`, ["tmdb", "movie", "900099", base]);
    check("upsert_item returns row", !!r1 && r1.source === "tmdb" && r1.kind === "movie" && r1.external_id === "900099", JSON.stringify({ s: r1?.source, k: r1?.kind, e: r1?.external_id }));
    check("upsert_item name stored", r1?.name === "Upsert Flick", r1?.name);
    check("upsert_item fabricated display_status ignored", r1?.display_status === "ok", r1?.display_status);
    check("upsert_item fabricated enrichment_status ignored", r1?.enrichment_status === "pending", r1?.enrichment_status);
    check("upsert_item fabricated localized ignored", JSON.stringify(r1?.localized) === "{}", JSON.stringify(r1?.localized));
    check("upsert_item fabricated id ignored (real uuid)", !!r1?.id && r1.id !== "00000000-0000-0000-0000-000000000000", r1?.id);
    check("upsert_item fetched_at honored from p_base", r1?.fetched_at && new Date(r1.fetched_at).toISOString().startsWith("2020-03-03"), r1?.fetched_at);
    const r2 = await one(`SELECT * FROM public.upsert_item($1,$2,$3,$4::jsonb)`,
      ["tmdb", "movie", "900099", JSON.stringify({ name: "Changed Name", fetched_at: "2021-01-01T00:00:00Z" })]);
    const nItems = await count(`SELECT count(*)::int AS c FROM public.items WHERE source='tmdb' AND kind='movie' AND external_id='900099'`);
    check("upsert_item twice -> still 1 row, name unchanged", nItems === 1 && r2?.name === "Upsert Flick", `n=${nItems} name=${r2?.name}`);
  }

  // ---------------- (i) ACL + catalog ----------------
  console.log("\n== (i) ACL: proacl/proconfig/prosecdef + anon/authenticated 42501 ==");
  {
    const meta = await all(
      `SELECT p.proname, p.prosecdef, p.proconfig, p.proacl::text AS proacl
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname = ANY($1) ORDER BY p.proname`, [FN_NAMES]);
    check("all 9 functions exist", meta.length === 9, `found=${meta.length}`);
    for (const m of meta) {
      const sp = (m.proconfig ?? []).some((c) => c.startsWith("search_path=public"));
      const aclOk = m.proacl === "{postgres=X/postgres,service_role=X/postgres}";
      console.log(`  ${m.proname}: prosecdef=${m.prosecdef} proconfig=${JSON.stringify(m.proconfig)} proacl=${m.proacl}`);
      check(`${m.proname} secdef+search_path+acl`, m.prosecdef === true && sp && aclOk, `definer=${m.prosecdef} sp=${sp} acl=${m.proacl}`);
    }
    // ACL denial: SET LOCAL ROLE anon / authenticated -> every function 42501
    for (const role of ["anon", "authenticated"]) {
      await client.query(`SET LOCAL ROLE ${role}`);
      for (const fn of FN_NAMES) {
        const [text, params] = FN_ARGS[fn];
        const r = await trySql(text, params);
        check(`${role} -> ${fn} raises 42501`, r.threw && r.code === "42501", `${r.code} ${r.message}`);
      }
    }
    // in-body guard proof: EXECUTE ok (service_role) but JWT claim != service_role
    await client.query(`SET LOCAL ROLE service_role`);
    await client.query(`SELECT set_config('request.jwt.claim.role','authenticated',true)`);
    for (const fn of FN_NAMES) {
      const [text, params] = FN_ARGS[fn];
      const r = await trySql(text, params);
      check(`guard: claim=authenticated -> ${fn} raises 42501`, r.threw && r.code === "42501", `${r.code} ${r.message}`);
    }
    await client.query(`SELECT set_config('request.jwt.claim.role','service_role',true)`);
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
    const markerUsers = Number((await c2.query(`SELECT count(*)::int AS c FROM public.users WHERE normalized_display_name LIKE 'harness-%'`)).rows[0].c);
    const markerItems = Number((await c2.query(`SELECT count(*)::int AS c FROM public.items WHERE external_id LIKE '9000%'`)).rows[0].c);
    const markerNotif = Number((await c2.query(`SELECT count(*)::int AS c FROM public.notifications WHERE payload->>'contributor_name' LIKE 'Harness %'`)).rows[0].c);
    if (markerUsers) { residue++; console.log(`RESIDUE  users harness markers: ${markerUsers}`); }
    if (markerItems) { residue++; console.log(`RESIDUE  items harness markers: ${markerItems}`); }
    if (markerNotif) { residue++; console.log(`RESIDUE  notifications harness markers: ${markerNotif}`); }
    console.log(residue === 0 ? "RESIDUE CHECK: zero residue — all table counts identical to pre-run baseline" : `RESIDUE CHECK: ${residue} table(s) differ`);
  } finally { c2.release(); await pool2.end(); }
}

process.exit(fail === 0 ? 0 : 1);

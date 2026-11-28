// verify-claim-guest-154.mjs — rollback harness for migration 154
// (V2-W9-CLAIM-1128-001): claim_guest.
// Applies the migration SQL inside ONE transaction against DATABASE_URL,
// exercises every acceptance case, and ALWAYS rolls back. Never prints secrets.
// Usage: node scripts/verify-claim-guest-154.mjs

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

const sqlText = readFileSync(join(root, "supabase", "migrations", "154_v2_claim_guest.sql"), "utf8");
const stripped = sqlText.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--[^\n]*/g, "");
if (/\b(commit|rollback|abort)\b/i.test(stripped) || /\b(begin|start)\s+(transaction|work)\b/i.test(stripped)) {
  console.error("REFUSE: migration file contains a transaction-control statement");
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
const one = async (text, params) => (await client.query(text, params)).rows[0];
const count = async (text, params) => Number((await one(text, params)).c);
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

const RESIDUE_TABLES = ["users", "asks", "contributors", "items", "submissions", "recommendations", "notifications"];
const baseline = {};
for (const t of RESIDUE_TABLES) baseline[t] = await count(`SELECT count(*)::int AS c FROM public.${t}`);

let rollbackDone = false;
try {
  await client.query("BEGIN");
  console.log("== applying migration 154 inside transaction ==");
  await client.query(sqlText);
  await client.query(`SELECT set_config('request.jwt.claim.role','service_role',true)`);

  const mkUser = async (label) => (await one(
    `INSERT INTO public.users (display_name, normalized_display_name) VALUES ($1, $2) RETURNING id`,
    [label, label.toLowerCase().replace(/[^a-z0-9]+/g, "-")]
  )).id;
  const mkAsk = async (owner, marker) => (await one(
    `INSERT INTO public.asks (owner_id, token, is_active) VALUES ($1, $2, true) RETURNING id`,
    [owner, ("h" + marker + randomUUID().replace(/-/g, "")).slice(0, 32)]
  )).id;
  const mkItem = async (externalId, name) => (await one(
    `INSERT INTO public.items (source,kind,external_id,name,enrichment_status) VALUES ('tmdb','movie',$1,$2,'pending') RETURNING id`,
    [externalId, name]
  )).id;
  const mkContributor = async (name, claimedBy = null) => (await one(
    `INSERT INTO public.contributors (display_name, secret_hash, claimed_by_user_id, claimed_at)
     VALUES ($1, decode(repeat('aa',32),'hex'), $2::uuid, CASE WHEN $2::uuid IS NULL THEN NULL ELSE now() END) RETURNING id`,
    [name, claimedBy]
  )).id;
  const mkSubmission = async (ask, contributor, titles = 1) => (await one(
    `INSERT INTO public.submissions (ask_id, contributor_id, client_batch_id, title_count)
     VALUES ($1,$2,$3,$4) RETURNING id`, [ask, contributor, randomUUID(), titles]
  )).id;
  const mkRecommendation = async (owner, item, contributor, submission, updatedAt) => (await one(
    `INSERT INTO public.recommendations (owner_id,item_id,contributor_id,submission_id,rating,updated_at)
     VALUES ($1,$2,$3,$4,80,$5) RETURNING id`, [owner, item, contributor, submission, updatedAt]
  )).id;

  // ---------- new account: claim in place + self-drop scoped to claimant ----------
  console.log("\n== new account / no existing contributor ==");
  const userNew = await mkUser("Harness Claim New");
  const ownerNew = await mkUser("Harness Claim Owner");
  const askOtherNew = await mkAsk(ownerNew, "a");
  const askSelfNew = await mkAsk(userNew, "b");
  const itemN1 = await mkItem("951001", "Harness N1");
  const itemN2 = await mkItem("951002", "Harness N2");
  const guestNew = await mkContributor("Harness New Guest");
  const subN1 = await mkSubmission(askOtherNew, guestNew);
  const subN2 = await mkSubmission(askSelfNew, guestNew);
  await mkRecommendation(ownerNew, itemN1, guestNew, subN1, "2026-01-01T00:00:00Z");
  await mkRecommendation(userNew, itemN2, guestNew, subN2, "2026-01-01T00:00:00Z");
  const newClaim = (await one(`SELECT public.claim_guest($1,$2) AS j`, [guestNew, userNew])).j;
  check("new account merged_into is same contributor", newClaim?.merged_into === guestNew, JSON.stringify(newClaim));
  check("new account moved/conflicts zero", newClaim?.moved_recommendations === 0 && newClaim?.merged_conflicts === 0, JSON.stringify(newClaim));
  check("new account dropped_self=1", newClaim?.dropped_self === 1, JSON.stringify(newClaim));
  const claimedRow = await one(`SELECT claimed_by_user_id, claimed_at IS NOT NULL AS has_claimed_at FROM public.contributors WHERE id=$1`, [guestNew]);
  check("new account claim fields set", claimedRow?.claimed_by_user_id === userNew && claimedRow?.has_claimed_at === true, JSON.stringify(claimedRow));
  check("new account surviving foreign-owner row kept", await count(`SELECT count(*)::int AS c FROM public.recommendations WHERE owner_id=$1 AND contributor_id=$2`, [ownerNew, guestNew]) === 1);
  check("new account self row dropped", await count(`SELECT count(*)::int AS c FROM public.recommendations WHERE owner_id=$1 AND contributor_id=$2`, [userNew, guestNew]) === 0);
  const idem = (await one(`SELECT public.claim_guest($1,$2) AS j`, [guestNew, userNew])).j;
  check("idempotent re-run same user returns zero counts", idem?.merged_into === guestNew && idem?.moved_recommendations === 0 && idem?.merged_conflicts === 0 && idem?.dropped_self === 0, JSON.stringify(idem));

  // ---------- existing account: merge, conflicts, notification re-point ----------
  console.log("\n== existing contributor merge ==");
  const userA = await mkUser("Harness Claim User A");
  const userB = await mkUser("Harness Claim User B");
  const ownerM = await mkUser("Harness Claim Owner M");
  const askM = await mkAsk(ownerM, "c");
  const askSelfM = await mkAsk(userA, "d");
  const item1 = await mkItem("951101", "Harness M1");
  const item2 = await mkItem("951102", "Harness M2");
  const item3 = await mkItem("951103", "Harness M3");
  const itemSelf = await mkItem("951104", "Harness MS");
  const target = await mkContributor("Harness Target", userA);
  const guest = await mkContributor("Harness Guest");
  const targetSub = await mkSubmission(askM, target);
  const targetSub2 = await mkSubmission(askM, target);
  const guestSub = await mkSubmission(askM, guest);
  const guestSub2 = await mkSubmission(askM, guest);
  const guestSub3 = await mkSubmission(askM, guest);
  const guestSelfSub = await mkSubmission(askSelfM, guest);
  const targetNewer = await mkRecommendation(ownerM, item1, target, targetSub, "2026-02-10T00:00:00Z");
  const guestOlder = await mkRecommendation(ownerM, item1, guest, guestSub, "2026-02-01T00:00:00Z");
  const targetOlder = await mkRecommendation(ownerM, item2, target, targetSub2, "2026-02-01T00:00:00Z");
  const guestNewer = await mkRecommendation(ownerM, item2, guest, guestSub2, "2026-02-10T00:00:00Z");
  const guestUnique = await mkRecommendation(ownerM, item3, guest, guestSub3, "2026-02-03T00:00:00Z");
  await mkRecommendation(userA, itemSelf, guest, guestSelfSub, "2026-02-03T00:00:00Z");
  const note = (await one(
    `INSERT INTO public.notifications (user_id,type,payload) VALUES ($1,'recommendation_received',$2::jsonb) RETURNING id`,
    [ownerM, JSON.stringify({ contributor_id: guest, contributor_name: "Harness Guest", count: 1, ask_id: askM, submission_id: guestSub })]
  )).id;

  const merged = (await one(`SELECT public.claim_guest($1,$2) AS j`, [guest, userA])).j;
  check("merge merged_into target", merged?.merged_into === target, JSON.stringify(merged));
  check("merge moved_recommendations=2 before self-drop", merged?.moved_recommendations === 2, JSON.stringify(merged));
  check("merge merged_conflicts=2", merged?.merged_conflicts === 2, JSON.stringify(merged));
  check("merge dropped_self=1", merged?.dropped_self === 1, JSON.stringify(merged));
  check("guest contributor row deleted", await count(`SELECT count(*)::int AS c FROM public.contributors WHERE id=$1`, [guest]) === 0);
  check("moved submissions re-pointed with NULL client_batch_id", await count(`SELECT count(*)::int AS c FROM public.submissions WHERE contributor_id=$1 AND client_batch_id IS NULL`, [target]) === 4, `n=${await count(`SELECT count(*)::int AS c FROM public.submissions WHERE contributor_id=$1 AND client_batch_id IS NULL`, [target])}`);
  check("target-newer conflict keeps target row", await count(`SELECT count(*)::int AS c FROM public.recommendations WHERE id=$1 AND contributor_id=$2`, [targetNewer, target]) === 1 && await count(`SELECT count(*)::int AS c FROM public.recommendations WHERE id=$1`, [guestOlder]) === 0);
  check("guest-newer conflict keeps guest row", await count(`SELECT count(*)::int AS c FROM public.recommendations WHERE id=$1 AND contributor_id=$2`, [guestNewer, target]) === 1 && await count(`SELECT count(*)::int AS c FROM public.recommendations WHERE id=$1`, [targetOlder]) === 0);
  check("non-conflict row moved to target", await count(`SELECT count(*)::int AS c FROM public.recommendations WHERE id=$1 AND contributor_id=$2`, [guestUnique, target]) === 1);
  const noteAfter = await one(`SELECT payload->>'contributor_id' AS cid FROM public.notifications WHERE id=$1`, [note]);
  check("notification payload contributor_id re-pointed", noteAfter?.cid === target, JSON.stringify(noteAfter));
  const targetIdem = (await one(`SELECT public.claim_guest($1,$2) AS j`, [target, userA])).j;
  check("idempotent re-run surviving contributor", targetIdem?.merged_into === target && targetIdem?.moved_recommendations === 0 && targetIdem?.merged_conflicts === 0, JSON.stringify(targetIdem));

  // ---------- claimed by another user ----------
  console.log("\n== claimed by another user ==");
  const otherClaimed = await mkContributor("Harness Other Claimed", userB);
  const wrong = await trySql(`SELECT public.claim_guest($1,$2)`, [otherClaimed, userA]);
  check("claimed-by-other -> CONTRIBUTOR_INVALID", wrong.threw && wrong.code === "P0001" && wrong.message.includes("CONTRIBUTOR_INVALID"), `${wrong.code} ${wrong.message}`);

  // ---------- class-S guard ----------
  await client.query(`SELECT set_config('request.jwt.claim.role','authenticated',true)`);
  const denied = await trySql(`SELECT public.claim_guest($1,$2)`, [randomUUID(), userA]);
  check("authenticated caller -> 42501 guard", denied.threw && denied.code === "42501", `${denied.code} ${denied.message}`);
  await client.query(`SELECT set_config('request.jwt.claim.role','service_role',true)`);

  const rotatedBefore = await one(`SELECT secret_hash FROM public.contributors WHERE id=$1`, [target]);
  await client.query(`SELECT public.guest_rotate_secret($1, decode(repeat('bb',32),'hex'))`, [target]);
  const rotatedAfter = await one(`SELECT secret_hash FROM public.contributors WHERE id=$1`, [target]);
  check("guest_rotate_secret stores a 32-byte replacement hash", Buffer.compare(Buffer.from(rotatedBefore.secret_hash), Buffer.from(rotatedAfter.secret_hash)) !== 0 && Buffer.from(rotatedAfter.secret_hash).length === 32);
  const badRotate = await trySql(`SELECT public.guest_rotate_secret($1, decode('aa','hex'))`, [target]);
  check("guest_rotate_secret rejects non-32-byte hash", badRotate.threw && badRotate.code === "P0001" && badRotate.message.includes("CONTRIBUTOR_INVALID"), `${badRotate.code} ${badRotate.message}`);
} finally {
  await client.query("ROLLBACK").catch(() => undefined);
  rollbackDone = true;
  client.release();
  await pool.end();
}

console.log("\n== rollback / residue ==");
check("ROLLBACK executed", rollbackDone);
const pool2 = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const verify = await pool2.connect();
try {
  for (const t of RESIDUE_TABLES) {
    const nowCount = Number((await verify.query(`SELECT count(*)::int AS c FROM public.${t}`)).rows[0].c);
    check(`zero residue ${t}`, nowCount === baseline[t], `before=${baseline[t]} after=${nowCount}`);
  }
} finally {
  verify.release();
  await pool2.end();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

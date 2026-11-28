// verify-housekeeping-email-live.mjs — WP5 live PROD proof for
// /api/cron/housekeeping and /api/cron/email. Uses a committed fixture
// graph, exercises cron auth and migration-149 enqueue/drain, then
// removes every fixture-owned row. The email provider is exercised in
// dry/stub mode only: RESEND_API_KEY and EMAIL_FROM are absent, the
// route must not claim, and the RPC claim/finish proof is rolled back.
// Usage: node scripts/verify-housekeeping-email-live.mjs

import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env.local") });

const REF = "lzkzfqshnjvlzosnntfx";
const BASE = process.env.WP5_PROOF_BASE_URL || "http://localhost:3002";
const required = ["NEXT_PUBLIC_SUPABASE_URL", "DATABASE_URL", "CRON_SECRET"];
for (const name of required) {
  if (!process.env[name]) {
    console.log(`ABORT ${name}=absent`);
    process.exit(3);
  }
}
if (!process.env.NEXT_PUBLIC_SUPABASE_URL.includes(REF)) {
  console.log("ABORT NEXT_PUBLIC_SUPABASE_URL is not LIKED PROD");
  process.exit(3);
}
console.log(`env RESEND_API_KEY=${process.env.RESEND_API_KEY ? "present" : "absent"} EMAIL_FROM=${process.env.EMAIL_FROM ? "present" : "absent"}`);

const { default: pg } = await import("pg");
let connStr = process.env.DATABASE_URL;
const pw = connStr.match(/:([^:@]+)@/)?.[1];
if (connStr.includes(`db.${REF}.supabase.co`)) {
  connStr = `postgresql://postgres.${REF}:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
}
const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
const q = (text, params) => client.query(text, params);
const one = async (text, params) => (await q(text, params)).rows[0];
const count = async (table) => Number((await one(`SELECT count(*)::int AS c FROM public.${table}`)).c);

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
};

const tables = [
  "users", "user_prefs", "contributors", "asks", "submissions",
  "recommendations", "items", "enrichment_jobs", "item_availability",
  "item_availability_fetch", "email_outbox", "account_deletion_jobs",
  "deletion_requests", "youtube_search_cache", "youtube_search_budget",
  "rate_limits", "notifications",
];
const baseline = {};
for (const t of tables) baseline[t] = await count(t);
console.log(`baseline_counts=${tables.map((t) => `${t}:${baseline[t]}`).join(",")}`);

const cronHeaders = { authorization: `Bearer ${process.env.CRON_SECRET}` };
const get = async (path, headers = {}) => {
  const res = await fetch(`${BASE}${path}`, { headers });
  let body = null;
  try { body = await res.json(); } catch { /* empty/non-json */ }
  return { status: res.status, body };
};

const stamp = Date.now().toString(36);
const fixture = {
  user: randomUUID(),
  contributor: randomUUID(),
  ask: randomUUID(),
  submission: randomUUID(),
  item: randomUUID(),
  recFixture: randomUUID(),
  recExisting: randomUUID(),
  existingItem: null,
};
let fixtureCommitted = false;

async function createFixture() {
  fixture.existingItem = (await one(`SELECT id FROM public.items ORDER BY created_at LIMIT 1`))?.id ?? null;
  await q(`INSERT INTO public.users(id,display_name,normalized_display_name) VALUES ($1,'WP5 Fixture',$2)`, [fixture.user, `wp5-${stamp}`]);
  await q(`INSERT INTO public.user_prefs(user_id,region_code,tmdb_lang) VALUES ($1,'US','en-US')`, [fixture.user]);
  await q(`INSERT INTO public.contributors(id,display_name,secret_hash) VALUES ($1,'WP5 Fixture',decode(repeat('22',32),'hex'))`, [fixture.contributor]);
  await q(`INSERT INTO public.asks(id,owner_id,token) VALUES ($1,$2,$3)`, [fixture.ask, fixture.user, `wp5-${stamp}-${randomUUID()}`]);
  await q(`INSERT INTO public.submissions(id,ask_id,contributor_id,client_batch_id,title_count) VALUES ($1,$2,$3,gen_random_uuid(),2)`, [fixture.submission, fixture.ask, fixture.contributor]);
  await q(`INSERT INTO public.items(id,source,kind,external_id,name,fetched_at,enrichment_status) VALUES ($1,'tmdb','movie','999999999','WP5 Fixture',now()-interval '200 days','pending')`, [fixture.item]);
  await q(`INSERT INTO public.recommendations(id,owner_id,item_id,contributor_id,submission_id) VALUES ($1,$2,$3,$4,$5)`, [fixture.recFixture, fixture.user, fixture.item, fixture.contributor, fixture.submission]);
  if (fixture.existingItem) {
    await q(`INSERT INTO public.recommendations(id,owner_id,item_id,contributor_id,submission_id) VALUES ($1,$2,$3,$4,$5)`, [fixture.recExisting, fixture.user, fixture.existingItem, fixture.contributor, fixture.submission]);
  }
  fixtureCommitted = true;
}

async function cleanupFixture() {
  await q(`DELETE FROM public.item_availability_fetch WHERE item_id = ANY($1)`, [[fixture.item, fixture.existingItem].filter(Boolean)]);
  await q(`DELETE FROM public.item_availability WHERE item_id = ANY($1)`, [[fixture.item, fixture.existingItem].filter(Boolean)]);
  await q(`DELETE FROM public.enrichment_jobs WHERE item_id=$1`, [fixture.item]);
  await q(`DELETE FROM public.recommendations WHERE id = ANY($1)`, [[fixture.recFixture, fixture.recExisting]]);
  await q(`DELETE FROM public.submissions WHERE id=$1`, [fixture.submission]);
  await q(`DELETE FROM public.asks WHERE id=$1`, [fixture.ask]);
  await q(`DELETE FROM public.contributors WHERE id=$1`, [fixture.contributor]);
  await q(`DELETE FROM public.user_prefs WHERE user_id=$1`, [fixture.user]);
  await q(`DELETE FROM public.users WHERE id=$1`, [fixture.user]);
  await q(`DELETE FROM public.items WHERE id=$1`, [fixture.item]);
}

try {
  const missing = await get("/api/cron/housekeeping");
  check("housekeeping missing bearer -> 401", missing.status === 401, `status=${missing.status}`);
  const wrong = await get("/api/cron/housekeeping", { authorization: "Bearer wrong" });
  check("housekeeping wrong bearer -> 401", wrong.status === 401, `status=${wrong.status}`);
  const emailMissing = await get("/api/cron/email");
  check("email missing bearer -> 401", emailMissing.status === 401, `status=${emailMissing.status}`);

  await createFixture();
  const fixtureJobsBefore = Number((await one(`SELECT count(*)::int c FROM public.enrichment_jobs WHERE item_id=$1`, [fixture.item])).c);
  check("fixture starts with no enrichment jobs", fixtureJobsBefore === 0, `jobs=${fixtureJobsBefore}`);

  const hk = await get("/api/cron/housekeeping", cronHeaders);
  const body = hk.body ?? {};
  check("housekeeping authenticated -> 200", hk.status === 200, `status=${hk.status} body=${JSON.stringify(body).slice(0, 300)}`);
  check("migration-149 enqueue includes fixture item", (body.enqueued ?? 0) >= 2, `enqueued=${body.enqueued}`);
  check("worker drain claimed jobs", (body.enrichment?.claimed ?? 0) >= 2, `claimed=${body.enrichment?.claimed}`);
  const fixtureJobsAfter = Number((await one(`SELECT count(*)::int c FROM public.enrichment_jobs WHERE item_id=$1 AND status='done'`, [fixture.item])).c);
  check("fixture details+availability jobs finished", fixtureJobsAfter === 2, `done_fixture_jobs=${fixtureJobsAfter}`);

  const email = await get("/api/cron/email", cronHeaders);
  check("email authenticated dry mode -> 200/email_not_configured", email.status === 200 && email.body?.reason === "email_not_configured" && email.body?.claimed === 0, `status=${email.status} body=${JSON.stringify(email.body)}`);

  await q("BEGIN");
  await q(`SELECT set_config('request.jwt.claims','{"role":"service_role"}',true)`);
  const outboxId = randomUUID();
  await q(`INSERT INTO public.email_outbox(id,kind,to_email,payload) VALUES ($1,'deletion_request_confirm',$2,$3)`, [outboxId, `fixture-${outboxId}@example.invalid`, JSON.stringify({ confirm_url: `https://example.invalid/confirm/${outboxId}` })]);
  const claimed = (await one(`SELECT public.email_claim(5) AS j`)).j ?? [];
  const claimedFixture = claimed.find((r) => r.id === outboxId);
  check("email_claim leases fixture outbox row", Boolean(claimedFixture) && claimedFixture.attempts === 1, `claimed=${claimed.length}`);
  await q(`SELECT public.email_finish($1,true,NULL)`, [outboxId]);
  const outboxRow = await one(`SELECT status,attempts FROM public.email_outbox WHERE id=$1`, [outboxId]);
  check("stubbed provider success -> email_finish sent", outboxRow.status === "sent" && outboxRow.attempts === 1, JSON.stringify(outboxRow));
  await q("ROLLBACK");
  console.log("email RPC proof ROLLBACK issued — nothing committed");
  check("REAL send NOT DONE", !process.env.RESEND_API_KEY && !process.env.EMAIL_FROM, "RESEND_API_KEY/EMAIL_FROM absent; provider HTTP stubbed/dry");
} catch (e) {
  try { await q("ROLLBACK"); } catch { /* no active tx */ }
  check("proof completed without exception", false, e?.message ?? String(e));
} finally {
  if (fixtureCommitted) await cleanupFixture();
  const after = {};
  for (const t of tables) after[t] = await count(t);
  console.log(`after_cleanup_counts=${tables.map((t) => `${t}:${after[t]}`).join(",")}`);
  const diffs = tables.filter((t) => after[t] !== baseline[t]).map((t) => `${t}:${baseline[t]}->${after[t]}`);
  check("audited cleanup zero residue by table count", diffs.length === 0, diffs.join(" ") || "equal");
  client.release();
  await pool.end();
  console.log(`HOUSEKEEPING_EMAIL_RESULT=${fail === 0 ? "PASS" : "FAIL"} pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

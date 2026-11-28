// verify-deletion-ledger-147.mjs — live proof for migration 147's
// deletion_job_advance ledger contract. Runs entirely inside one
// rollback transaction: storage -> auth -> equal auth -> done; backward
// moves are rejected and 'done' nulls the stored email.
// Usage: node scripts/verify-deletion-ledger-147.mjs

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
if (!process.env.DATABASE_URL) {
  console.error("ABORT: DATABASE_URL is not set");
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

const jobId = randomUUID();
const baselineJobs = await count(`SELECT count(*)::int AS c FROM public.account_deletion_jobs`);
console.log(`baseline account_deletion_jobs=${baselineJobs}`);

try {
  await client.query("BEGIN");
  await client.query(`SELECT set_config('request.jwt.claims','{"role":"service_role"}',true)`);
  await client.query(
    `INSERT INTO public.account_deletion_jobs (user_id,email,stage)
     VALUES ($1,$2,'storage')`,
    [jobId, `fixture-${jobId}@example.invalid`]
  );

  await client.query(`SELECT public.deletion_job_advance($1,'auth')`, [jobId]);
  let row = await one(
    `SELECT stage, attempts, email IS NOT NULL AS has_email FROM public.account_deletion_jobs WHERE user_id=$1`,
    [jobId]
  );
  check("storage -> auth advances forward", row.stage === "auth" && row.has_email === true, JSON.stringify(row));

  const equal = await trySql(`SELECT public.deletion_job_advance($1,'auth')`, [jobId]);
  check("equal stage auth -> auth is allowed", !equal.threw, `${equal.code ?? ""} ${equal.message ?? ""}`.trim());

  const backward = await trySql(`SELECT public.deletion_job_advance($1,'storage')`, [jobId]);
  check("backward auth -> storage is rejected", backward.threw && backward.code === "22023", `${backward.code} ${backward.message}`);

  await client.query(`SELECT public.deletion_job_advance($1,'done')`, [jobId]);
  row = await one(
    `SELECT stage, completed_at IS NOT NULL AS completed, email, attempts FROM public.account_deletion_jobs WHERE user_id=$1`,
    [jobId]
  );
  check("done marks completed and nulls email", row.stage === "done" && row.completed === true && row.email === null, JSON.stringify(row));

  const afterDone = await trySql(`SELECT public.deletion_job_advance($1,'email')`, [jobId]);
  check("done -> email backward is rejected", afterDone.threw && afterDone.code === "22023", `${afterDone.code} ${afterDone.message}`);
} finally {
  await client.query("ROLLBACK");
  console.log("ROLLBACK issued — transaction discarded, nothing committed");
}

const afterJobs = await count(`SELECT count(*)::int AS c FROM public.account_deletion_jobs`);
const fixtureRows = await count(`SELECT count(*)::int AS c FROM public.account_deletion_jobs WHERE user_id=$1`, [jobId]);
check("audited cleanup: fixture row absent after rollback", fixtureRows === 0, `fixture_rows=${fixtureRows}`);
check("audited cleanup: account_deletion_jobs count unchanged", afterJobs === baselineJobs, `before=${baselineJobs} after=${afterJobs}`);

client.release();
await pool.end();
console.log(`===== LEDGER147 RESULT: ${pass} passed, ${fail} failed =====`);
process.exit(fail === 0 ? 0 : 1);

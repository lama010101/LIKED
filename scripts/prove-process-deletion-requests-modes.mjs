// prove-process-deletion-requests-modes.mjs — WP-1 F-D live fixture
// proof. Creates ONE confirmed deletion_requests row for a throwaway
// address with no auth user, proves default mode is a dry run, proves
// --yes rejects only that fixture, then removes the row. Prints ids and
// PASS/FAIL only; never prints an email address or secret.
import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import { spawnSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
config({ path: join(root, ".env.local") });

const LIKED_REF = "lzkzfqshnjvlzosnntfx";
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(LIKED_REF)) {
  console.error("ABORT: NEXT_PUBLIC_SUPABASE_URL is not the LIKED project");
  process.exit(3);
}
for (const k of ["DATABASE_URL", "SUPABASE_SECRET_KEY"]) {
  if (!process.env[k]) {
    console.error(`ABORT: ${k} is not set`);
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
const one = async (text, params) => (await pool.query(text, params)).rows[0];
const count = async (text, params = []) => Number((await one(text, params)).c);

let pass = 0, fail = 0, fixtureId = null, baseline = null;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
};
const safeLines = (text) => {
  if (text.includes("@")) return ["WITHHELD: output contained an email-shaped token"];
  return text.trim().split(/\r?\n/).filter(Boolean).slice(-8);
};

try {
  baseline = {
    deletion_requests: await count(`SELECT count(*)::int AS c FROM public.deletion_requests`),
    confirmed: await count(`SELECT count(*)::int AS c FROM public.deletion_requests WHERE status='confirmed'`),
    auth_users: await count(`SELECT count(*)::int AS c FROM auth.users`),
  };
  console.log(`counts_before deletion_requests=${baseline.deletion_requests} confirmed=${baseline.confirmed} auth_users=${baseline.auth_users}`);
  if (baseline.confirmed !== 0) {
    check("precondition: no pre-existing confirmed deletion requests", false, `confirmed=${baseline.confirmed}`);
    throw new Error("unsafe to execute --yes with pre-existing confirmed rows");
  }
  check("precondition: no pre-existing confirmed deletion requests", true);

  const run = Date.now().toString(36);
  const email = `zz-w8-runbook-${run}@example.com`;
  const inserted = await one(
    `INSERT INTO public.deletion_requests (email, token_hash, status, confirmed_at)
     VALUES ($1,$2,'confirmed',now()) RETURNING id`,
    [email, randomBytes(32)]
  );
  fixtureId = inserted.id;
  console.log(`fixture request=${fixtureId}`);

  const dry = spawnSync(process.execPath, [join(root, "scripts/process-deletion-requests.mjs"), "--limit", "10"], {
    cwd: root,
    encoding: "utf8",
    timeout: 60000,
  });
  for (const line of safeLines(dry.stdout)) console.log(`dry_out ${line}`);
  if (dry.stderr) console.log("dry_stderr present");
  const dryStatus = await one(`SELECT status FROM public.deletion_requests WHERE id=$1`, [fixtureId]);
  check("default mode exits successfully", dry.status === 0, `exit=${dry.status}`);
  check("default dry run leaves fixture confirmed", dryStatus?.status === "confirmed", `status=${dryStatus?.status}`);
  check("dry run prints no email-shaped token", !dry.stdout.includes("@") && !dry.stderr.includes("@"));

  const yes = spawnSync(process.execPath, [join(root, "scripts/process-deletion-requests.mjs"), "--limit", "10", "--yes"], {
    cwd: root,
    encoding: "utf8",
    timeout: 120000,
  });
  for (const line of safeLines(yes.stdout)) console.log(`yes_out ${line}`);
  if (yes.stderr) console.log("yes_stderr present");
  const yesStatus = await one(`SELECT status FROM public.deletion_requests WHERE id=$1`, [fixtureId]);
  check("--yes mode exits successfully", yes.status === 0, `exit=${yes.status}`);
  check("--yes rejects fixture with no auth user", yesStatus?.status === "rejected", `status=${yesStatus?.status}`);
  check("--yes prints no email-shaped token", !yes.stdout.includes("@") && !yes.stderr.includes("@"));
} finally {
  if (fixtureId) {
    try {
      await pool.query(`DELETE FROM public.deletion_requests WHERE id=$1`, [fixtureId]);
      console.log(`cleanup_deleted_fixture request=${fixtureId}`);
    } catch (e) {
      console.log(`cleanup_failed request=${fixtureId}`);
      fail++;
    }
  }
  if (fixtureId && baseline) {
    const after = {
      deletion_requests: await count(`SELECT count(*)::int AS c FROM public.deletion_requests`),
      auth_users: await count(`SELECT count(*)::int AS c FROM auth.users`),
    };
    console.log(`counts_after deletion_requests=${after.deletion_requests} auth_users=${after.auth_users}`);
    check(
      "audited counts equal before/after cleanup",
      after.deletion_requests === baseline.deletion_requests && after.auth_users === baseline.auth_users,
      `deletion_requests ${baseline.deletion_requests}->${after.deletion_requests}; auth_users ${baseline.auth_users}->${after.auth_users}`
    );
  }
  await pool.end();
}
console.log(`WP1_FD_RESULT=${fail === 0 ? "PASS" : "FAIL"} pass=${pass} fail=${fail}`);
process.exit(fail ? 1 : 0);

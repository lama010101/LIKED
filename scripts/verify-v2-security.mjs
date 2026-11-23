// verify-v2-security.mjs — T11 probe (PLAN-V2-002 §8, threat table
// row T11 "Direct DB access with the publishable key").
//
// Connects like check-invariants-001.mjs (DATABASE_URL + LIKED
// project guard), opens BEGIN … ROLLBACK, and for each of the roles
// anon and authenticated (SET LOCAL ROLE):
//   * every v2 table: SELECT count(*) must be permission denied
//     (SQLSTATE 42501) or return 0 rows;
//   * every class-S function: denied for BOTH roles;
//   * every class-O function: denied for anon; for authenticated only
//     has_function_privilege EXECUTE = true is asserted (never call).
//
// PROBE RULE: before calling any function as anon/authenticated,
// has_function_privilege(role, oid, 'EXECUTE') is checked read-only.
// Only when it is false is the function called (expected 42501), one
// SAVEPOINT per call, NULL::<type> arguments from the identity args.
// If it is unexpectedly true the function is NOT called — the probe
// FAILs with the function name.
//
// Exit 0 only if every probe matches expectation; one PASS/FAIL line
// per probe plus a final summary. Nothing is ever committed.
//
// Usage: node scripts/verify-v2-security.mjs

import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { deriveV2Tables } from "./check-invariants-001.db20.mjs";
import {
  deriveV2Functions,
  loadV2FunctionCatalog,
  loadFunctionExecGrants,
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

const { default: pg } = await import("pg");
let connStr = process.env.DATABASE_URL;
const pw = connStr.match(/:([^:@]+)@/)?.[1];
if (connStr.includes(`db.${LIKED_REF}.supabase.co`)) {
  connStr = `postgresql://postgres.${LIKED_REF}:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
}
const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();

// Harness safety (same pattern as verify-delete-account.mjs): on
// SIGINT/SIGTERM/uncaught error, issue ROLLBACK and close — a killed
// run must never leave an idle-in-transaction session or locks behind
// on the live DB.
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
  "SET application_name = 'liked-harness-v2-security';"
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

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  ok ? pass++ : fail++;
};

// Derived sets (printed so vacuous/mismatched derivations are visible).
const v2Tables = deriveV2Tables(root);
const derived = deriveV2Functions(root);
const clsOf = new Map(derived.map((f) => [f.name, f.cls]));
const sNames = derived.filter((f) => f.cls === "S").map((f) => f.name);
const oNames = derived.filter((f) => f.cls === "O").map((f) => f.name);
console.log(`v2 tables derived from migrations 142/143 (${v2Tables.length}): ${v2Tables.join(", ")}`);
console.log(`v2 functions derived from migrations 142-146 (${derived.length}): S(${sNames.length})=[${sNames.join(", ")}] O(${oNames.length})=[${oNames.join(", ")}]`);

try {
  await client.query("BEGIN");

  // ---- catalog reads (as postgres, before any SET LOCAL ROLE) ----
  const cat = await loadV2FunctionCatalog(client, derived.map((f) => f.name));
  const rows = cat.map((r) => ({ ...r, cls: clsOf.get(r.name) ?? "S" }));
  const byName = new Map();
  for (const r of rows) {
    if (!byName.has(r.name)) byName.set(r.name, []);
    byName.get(r.name).push(r);
  }
  const oids = rows.map((r) => r.oid);
  const execGrants = await loadFunctionExecGrants(client, oids, ["anon", "authenticated"]);
  const hasExec = (role, oid) => execGrants.get(`${role}|${oid}`) === true;

  // ---- role probes: anon first, then authenticated (SET LOCAL ROLE
  // last, same ordering discipline as verify-delete-account.mjs) ----
  for (const role of ["anon", "authenticated"]) {
    await client.query(`SET LOCAL ROLE ${role}`);
    try {
      // tables: permission denied (42501) or 0 rows
      for (const t of v2Tables) {
        const res = await probeSql(client, `SELECT count(*)::int AS c FROM public.${t}`);
        const ok =
          (res.threw && res.code === "42501") ||
          (!res.threw && Number(res.rows[0]?.c) === 0);
        check(
          `table ${t} as ${role}`,
          ok,
          res.threw ? `${res.code} ${res.message}`.trim() : `rows=${res.rows[0]?.c}`
        );
      }
      // functions: per PROBE RULE plan
      for (const fn of derived) {
        const rs = byName.get(fn.name) ?? [];
        if (rs.length === 0) {
          check(`fn ${fn.name} as ${role}`, false, "missing from live catalog");
          continue;
        }
        for (const r of rs) {
          const label = rs.length > 1 ? `${fn.name}(${r.identity_args})` : fn.name;
          const plan = planV2RoleProbe(fn.cls, role, hasExec(role, r.oid));
          if (plan.action === "call-deny") {
            const res = await probeSql(client, buildProbeCall(r.name, r.argtypes));
            check(
              `fn ${label} as ${role}`,
              res.threw && res.code === "42501",
              res.threw ? `${res.code} ${res.message}`.trim() : `UNEXPECTED SUCCESS: ${JSON.stringify(res.rows[0])}`
            );
          } else if (plan.action === "assert-grant") {
            check(`fn ${label} as ${role}`, true, "has_function_privilege EXECUTE=true (not called)");
          } else {
            check(`fn ${label} as ${role}`, false, plan.reason);
          }
        }
      }
    } finally {
      await client.query("RESET ROLE");
    }
  }

  console.log(`\n===== verify-v2-security: ${pass} passed, ${fail} failed =====`);
} catch (e) {
  fail++;
  console.log(`HARNESS ERROR: ${e.message}`);
} finally {
  try { await client.query("ROLLBACK"); console.log("ROLLBACK issued — transaction discarded, nothing committed"); }
  catch (e) { console.log(`ROLLBACK failed: ${e.message}`); }
  client.release();
  await pool.end();
}

process.exit(fail === 0 ? 0 : 1);

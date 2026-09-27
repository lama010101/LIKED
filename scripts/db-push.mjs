// Sanctioned migration path: runs `supabase db push` (or any `supabase` subcommand
// that accepts --db-url) against the LIKED project via the Supavisor pooler.
// The direct db.<ref>.supabase.co host is IPv6-only and unreachable from most
// dev machines, so DATABASE_URL is rewritten to the session pooler. The URL and
// password are never printed.
//
// Usage:
//   node scripts/db-push.mjs                 # supabase db push --yes
//   node scripts/db-push.mjs --dry-run       # supabase db push --dry-run --yes
//   node scripts/db-push.mjs migration list  # any other supabase subcommand
//
// Migration files use numeric prefixes (111_name.sql, 112_name.sql, ...);
// schema_migrations history must stay in sync with supabase/migrations/.
import { config } from "dotenv";
import { spawnSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: join(root, ".env.local") });

const REF = "lzkzfqshnjvlzosnntfx";
const raw = process.env.DATABASE_URL;
if (!raw) {
  console.error("DATABASE_URL missing in .env.local");
  process.exit(2);
}
const u = new URL(raw);
if (!u.hostname.includes(REF) && !u.username.includes(REF)) {
  console.error("ABORT: DATABASE_URL is not the LIKED project");
  process.exit(3);
}
u.hostname = "aws-1-us-west-2.pooler.supabase.com";
u.username = `postgres.${REF}`;
u.port = "5432";
const dbUrl = u.toString();

const argv = process.argv.slice(2);
const args =
  argv.length === 0 || argv[0].startsWith("--")
    ? ["db", "push", ...argv, "--yes"]
    : argv;

const r = spawnSync("supabase", [...args, "--db-url", dbUrl], {
  cwd: root,
  encoding: "utf8",
});
const redact = (s) =>
  (s || "").split(dbUrl).join("<db-url>").split(decodeURIComponent(u.password)).join("***");
process.stdout.write(redact(r.stdout));
process.stderr.write(redact(r.stderr));
process.exit(r.status ?? 2);

#!/usr/bin/env node
// WP-4 rollback-wrapped harness for draft migration 150. Requires migration
// 150 to already be applied in the target environment; proves positive,
// negative and cross-user isolation with zero committed residue.
import { config } from "dotenv";
import { randomUUID } from "crypto";
config({ path: ".env.local" });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("lzkzfqshnjvlzosnntfx") || !process.env.DATABASE_URL) {
  console.log("ABORT required env absent or non-LIKED project");
  process.exit(3);
}
const { default: pg } = await import("pg");
let connStr = process.env.DATABASE_URL;
const pw = connStr.match(/:([^:@]+)@/)?.[1];
if (connStr.includes("db.lzkzfqshnjvlzosnntfx.supabase.co")) {
  connStr = `postgresql://postgres.lzkzfqshnjvlzosnntfx:${pw}@aws-1-us-west-2.pooler.supabase.com:5432/postgres`;
}
const pool = new pg.Pool({ connectionString: connStr, connectionTimeoutMillis: 15000, ssl: { rejectUnauthorized: false } });
const client = await pool.connect();
const q = (text, params) => client.query(text, params);
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`); ok ? pass++ : fail++; };
const ids = { a: randomUUID(), b: randomUUID(), item: randomUUID() };
const asUser = async (id) => q("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
try {
  await q("BEGIN");
  await q("SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)");
  for (const [id, name] of [[ids.a, "P101 Fixture A"], [ids.b, "P101 Fixture B"]]) {
    await q("INSERT INTO public.users(id,display_name,normalized_display_name) VALUES ($1,$2,$3)", [id, name, `p101-${Date.now()}-${id.slice(0, 6)}`]);
  }
  await q("INSERT INTO public.items(id,source,kind,external_id,name,enrichment_status) VALUES ($1,'tmdb','movie','991500001','P101 Fixture','pending')", [ids.item]);

  await asUser(ids.a);
  await q("SELECT public.set_item_status($1,'watched')", [ids.item]);
  const watched = await q("SELECT status FROM public.owner_item_state WHERE owner_id=$1 AND item_id=$2", [ids.a, ids.item]);
  check("positive watched upsert", watched.rows[0]?.status === "watched", watched.rows[0]?.status ?? "missing");

  await q("SAVEPOINT invalid_status");
  let rejected = false, code = "";
  try { await q("SELECT public.set_item_status($1,'bad')", [ids.item]); } catch (e) { rejected = true; code = e.code || ""; }
  await q("ROLLBACK TO SAVEPOINT invalid_status");
  check("negative invalid status rejected", rejected && code === "22023", `code=${code}`);

  await asUser(ids.b);
  await q("SELECT public.set_item_status($1,'dismissed')", [ids.item]);
  await asUser(ids.a);
  const rows = await q("SELECT owner_id,status FROM public.owner_item_state WHERE item_id=$1 ORDER BY owner_id", [ids.item]);
  const aRow = rows.rows.find((r) => r.owner_id === ids.a)?.status;
  const bRow = rows.rows.find((r) => r.owner_id === ids.b)?.status;
  check("cross-user isolation rows are distinct", rows.rows.length === 2 && aRow === "watched" && bRow === "dismissed", `a=${aRow} b=${bRow} rows=${rows.rows.length}`);

  await q("SELECT public.set_item_status($1,'dismissed')", [ids.item]);
  const dismissedAt = await q("SELECT updated_at FROM public.owner_item_state WHERE owner_id=$1 AND item_id=$2", [ids.a, ids.item]);
  check("dismissed upsert records state timestamp", Boolean(dismissedAt.rows[0]?.updated_at));

  await q("ROLLBACK");
  console.log("ROLLBACK issued — fixture rows not committed; residue=0");
} catch (e) {
  try { await q("ROLLBACK"); } catch {}
  check("harness completed without exception", false, e.message);
} finally {
  client.release(); await pool.end();
  console.log(`P101_STATUS_RESULT=${fail === 0 ? "PASS" : "FAIL"} pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
}

// C5 rollback-wrapped RPC proof: submit_recommendations rejects invalid
// ratings, stores explicit 0 as 0 and absent as NULL. No commit; zero residue.
// Usage: node scripts/verify-score-rpc.mjs (uses DATABASE_URL/NEXT_PUBLIC_SUPABASE_URL from env/.env.local)
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
const check = (name, ok, detail="") => { console.log(`${ok?"PASS":"FAIL"} ${name}${detail?` — ${detail}`:""}`); ok?pass++:fail++; };
const ids = { user: randomUUID(), contributor: randomUUID(), ask: randomUUID(), item0: randomUUID(), itemNull: randomUUID() };
try {
  await q("BEGIN");
  await q(`SELECT set_config('request.jwt.claims','{"role":"service_role"}',true)`);
  await q(`INSERT INTO public.users(id,display_name,normalized_display_name) VALUES ($1,'C5 Fixture',$2)`, [ids.user, `c5-${Date.now()}`]);
  await q(`INSERT INTO public.user_prefs(user_id,region_code,tmdb_lang) VALUES ($1,'US','en-US')`, [ids.user]);
  await q(`INSERT INTO public.contributors(id,display_name,secret_hash) VALUES ($1,'C5 Fixture',decode(repeat('33',32),'hex'))`, [ids.contributor]);
  await q(`INSERT INTO public.asks(id,owner_id,token,is_active) VALUES ($1,$2,$3,true)`, [ids.ask, ids.user, `c5-${randomUUID()}`]);
  for (const [id, ext] of [[ids.item0, "991000001"], [ids.itemNull, "991000002"]]) {
    await q(`INSERT INTO public.items(id,source,kind,external_id,name,enrichment_status) VALUES ($1,'tmdb','movie',$2,'C5 Fixture','pending')`, [id, ext]);
  }
  const tokenRow = await q(`SELECT token FROM public.asks WHERE id=$1`, [ids.ask]);
  const token = tokenRow.rows[0].token;
  const call = (rating) => q(`SELECT public.submit_recommendations($1,$2,$3,$4::jsonb)`, [
    token, ids.contributor, randomUUID(), JSON.stringify([{ item_id: ids.item0, rating }])
  ]);
  for (const [name, rating] of [["rejects 101",101],["rejects -1",-1],["rejects 1.5",1.5],["rejects non-number","x"]]) {
    await q("SAVEPOINT bad_rating");
    let rejected = false, code = "";
    try { await call(rating); } catch (e) { rejected = true; code = e.code || ""; }
    await q("ROLLBACK TO SAVEPOINT bad_rating");
    check(name, rejected && code === "22023", `code=${code}`);
  }
  const ok = await q(`SELECT public.submit_recommendations($1,$2,$3,$4::jsonb) AS result`, [
    token, ids.contributor, randomUUID(), JSON.stringify([{ item_id: ids.item0, rating: 0 }, { item_id: ids.itemNull }])
  ]);
  check("valid zero/absent batch accepted", Boolean(ok.rows[0]?.result?.accepted), JSON.stringify(ok.rows[0]?.result));
  const rows = await q(`SELECT item_id,rating FROM public.recommendations WHERE owner_id=$1 ORDER BY item_id`, [ids.user]);
  const r0 = rows.rows.find((r) => r.item_id === ids.item0)?.rating;
  const rn = rows.rows.find((r) => r.item_id === ids.itemNull)?.rating;
  check("explicit 0 stored as 0", r0 === 0, `rating=${r0}`);
  check("absent rating stored as null", rn === null, `rating=${rn}`);
  await q("ROLLBACK");
  console.log("ROLLBACK issued — fixture rows not committed");
} catch (e) {
  try { await q("ROLLBACK"); } catch {}
  check("harness completed without exception", false, e.message);
} finally {
  client.release(); await pool.end();
  console.log(`C5_RPC_RESULT=${fail===0?"PASS":"FAIL"} pass=${pass} fail=${fail}`);
  process.exit(fail ? 1 : 0);
}

// process-deletion-requests.mjs — runbook script (PLAN-V2-002 §3.6,
// P0-20): drains confirmed public deletion_requests within 30 days.
// Claims via deletion_requests_claim (class S), matches the auth user by
// email (admin.listUsers scan), runs the SAME stage order as
// lib/account/deletionPipeline.ts — revoke -> delete_account -> Storage
// purge -> auth.admin.deleteUser -> deletion_job_advance — then
// deletion_request_finish 'done'|'rejected'. Mailbox proof + email match
// replace interactive re-auth. No auth user -> 'rejected'; pipeline
// errors are logged and left claimed-expired for the next run.
//
// Usage: node scripts/process-deletion-requests.mjs [--limit N]
// Requires .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY.

import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env.local") });

const LIKED_REF = "lzkzfqshnjvlzosnntfx";
if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes(LIKED_REF)) {
  console.error("ABORT: NEXT_PUBLIC_SUPABASE_URL is not the LIKED project");
  process.exit(3);
}
if (!process.env.SUPABASE_SECRET_KEY) {
  console.error("ABORT: SUPABASE_SECRET_KEY is not set");
  process.exit(3);
}

const limitArg = process.argv.indexOf("--limit");
const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) || 10 : 10;

const { createClient } = await import("@supabase/supabase-js");
const { decryptToken } = await import("../lib/youtube/token-crypto.ts").catch(() => ({ decryptToken: null }));

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function rpc(fn, params) {
  const { data, error } = await supabase.rpc(fn, params);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

async function findUserIdByEmail(email) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const users = data?.users ?? [];
    const hit = users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (users.length < 200) return null;
  }
  return null;
}

async function advance(userId, stage, error = null) {
  try {
    await rpc("deletion_job_advance", { p_user_id: userId, p_stage: stage, p_error: error });
  } catch (e) {
    console.log(`  advance(${stage}) failed: ${e.message}`);
  }
}

async function revokeGoogle(userId) {
  try {
    const { data } = await supabase
      .from("youtube_connections")
      .select("access_token, refresh_token")
      .eq("user_id", userId)
      .maybeSingle();
    let token = null;
    try {
      if (data?.refresh_token) token = decryptToken ? decryptToken(data.refresh_token) : null;
      else if (data?.access_token) token = decryptToken ? decryptToken(data.access_token) : null;
    } catch { token = null; }
    if (token) {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(8000),
      });
    }
  } catch { /* best-effort */ }
}

async function purgeStorage(userId) {
  const bucket = supabase.storage.from("thumbnails");
  const prefix = `${userId}/`;
  for (let guard = 0; guard < 100; guard++) {
    const { data, error } = await bucket.list(prefix, { limit: 100 });
    if (error) throw new Error(`storage_list: ${error.message}`);
    const names = (data ?? []).map((o) => o.name).filter(Boolean);
    if (names.length === 0) return;
    const paths = names.map((n) => `${prefix}${n}`);
    for (let i = 0; i < paths.length; i += 100) {
      const { error: rmErr } = await bucket.remove(paths.slice(i, i + 100));
      if (rmErr) throw new Error(`storage_remove: ${rmErr.message}`);
    }
  }
  throw new Error("storage_purge: iteration cap reached");
}

async function deleteAuthUser(userId) {
  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (!error) return;
  const msg = error.message ?? "";
  if ((error.status ?? 0) === 404 || error.code === "user_not_found" || /not found/i.test(msg)) return;
  throw new Error(`auth_delete: ${msg}`);
}

/** Same stage order as lib/account/deletionPipeline.ts. */
async function pipeline(userId, email) {
  await revokeGoogle(userId);
  await rpc("delete_account", { p_user_id: userId, p_email: email });
  await purgeStorage(userId);
  await advance(userId, "auth");
  await deleteAuthUser(userId);
  await advance(userId, "email");
  await advance(userId, "done");
}

const claimed = await rpc("deletion_requests_claim", { p_limit: limit });
const requests = Array.isArray(claimed) ? claimed : [];
console.log(`claimed ${requests.length} deletion request(s)`);

let done = 0, rejected = 0, failed = 0;
for (const req of requests) {
  const email = typeof req?.email === "string" ? req.email : "";
  try {
    const userId = await findUserIdByEmail(email);
    if (!userId) {
      await rpc("deletion_request_finish", { p_id: req.id, p_status: "rejected" });
      rejected++;
      console.log(`rejected ${req.id} (${email}): no auth user`);
      continue;
    }
    await pipeline(userId, email);
    await rpc("deletion_request_finish", { p_id: req.id, p_status: "done" });
    done++;
    console.log(`done ${req.id} (${email})`);
  } catch (e) {
    failed++;
    console.log(`FAILED ${req.id} (${email}): ${e?.message ?? e} — left for next run`);
  }
}
console.log(`summary: done=${done} rejected=${rejected} failed=${failed}`);
process.exit(failed ? 1 : 0);

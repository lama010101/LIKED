import { createHash, randomBytes, randomUUID } from "crypto";
import { config } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Test-only fixtures for the v2 owner UI specs (PLAN-V2-002 §8.1 P0-16/17/19,
// task V2-W4-OWNER-UI-1124-001). Uses the SERVICE client to call the
// migration-144 class-S guest RPCs exactly as the guest routes do. Never
// imported by app code (REPO-16); every created row is prefixed zz-e2e- and
// removed in afterAll via delete_guest_data.

config({ path: ".env.local" });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

export const FIXTURE_PREFIX = "zz-e2e-";

function requireEnv(): { url: string; serviceKey: string } {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    throw new Error(
      "v2 fixtures need NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (values are never printed)"
    );
  }
  return { url: SUPABASE_URL, serviceKey: SERVICE_KEY };
}

export function serviceClient(): SupabaseClient {
  const { url, serviceKey } = requireEnv();
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface FixtureGuest {
  contributorId: string;
  name: string;
}

/** guest_create_contributor (migration 144) with a random sha256 secret. */
export async function createGuest(name: string): Promise<FixtureGuest> {
  const secret = randomBytes(24);
  const hash = createHash("sha256").update(secret).digest();
  const { data, error } = await serviceClient().rpc("guest_create_contributor", {
    p_name: name,
    p_secret_hash: "\\x" + hash.toString("hex"),
  });
  if (error) throw new Error(`guest_create_contributor: ${error.message}`);
  return { contributorId: data as string, name };
}

/** upsert_item (migration 144) — the only way items are created. */
export async function upsertTmdbItem(
  externalId: string,
  base: Record<string, unknown>
): Promise<string> {
  const { data, error } = await serviceClient().rpc("upsert_item", {
    p_source: "tmdb",
    p_kind: "movie",
    p_external_id: externalId,
    p_base: base,
  });
  if (error) throw new Error(`upsert_item: ${error.message}`);
  return (data as { id: string }).id;
}

export interface FixtureRecommendation {
  item_id: string;
  rating?: number | null;
  platform?: string | null;
  comment?: string | null;
}

/** submit_recommendations (migration 144) — one atomic batch per guest. */
export async function submitRecommendations(
  askToken: string,
  contributorId: string,
  items: FixtureRecommendation[]
): Promise<{ submission_id: string; accepted: number }> {
  const { data, error } = await serviceClient().rpc("submit_recommendations", {
    p_ask_token: askToken,
    p_contributor_id: contributorId,
    p_client_batch_id: randomUUID(),
    p_items: items,
  });
  if (error) throw new Error(`submit_recommendations: ${error.message}`);
  return data as { submission_id: string; accepted: number };
}

/** The owner's Ask token (created by ensure_my_ask on the first /inbox load). */
export async function getOwnerAskToken(ownerId: string): Promise<string | null> {
  const { data, error } = await serviceClient()
    .from("asks")
    .select("token")
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw new Error(`asks read: ${error.message}`);
  return (data as { token: string } | null)?.token ?? null;
}

/** Class-S probe used to prove a regenerated token is dead. */
export async function guestGetAsk(
  token: string
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await serviceClient().rpc("guest_get_ask", { p_token: token });
  return error ? { ok: false, message: error.message } : { ok: true };
}

/** delete_guest_data: submissions, recommendations, notifications, budget. */
export async function deleteGuest(contributorId: string): Promise<void> {
  const { error } = await serviceClient().rpc("delete_guest_data", {
    p_contributor_id: contributorId,
  });
  if (error) throw new Error(`delete_guest_data: ${error.message}`);
}

export interface OwnerPrefsRow {
  region_code: string | null;
  notify_email: boolean;
  theme: string;
  accent: string;
  tmdb_lang: string | null;
  language_set_at: string | null;
}

/** Direct read of the owner's user_prefs row (service client, select only). */
export async function readOwnerPrefs(userId: string): Promise<OwnerPrefsRow | null> {
  const { data, error } = await serviceClient()
    .from("user_prefs")
    .select("region_code,notify_email,theme,accent,tmdb_lang,language_set_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`user_prefs read: ${error.message}`);
  return (data as OwnerPrefsRow | null) ?? null;
}

/** True when the owner's public.users row still exists (sign-out deletes nothing). */
export async function userRowExists(userId: string): Promise<boolean> {
  const { data, error } = await serviceClient()
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(`users read: ${error.message}`);
  return !!data;
}

/** Removes only the item rows this spec created (catalog rows are shared). */
export async function deleteItems(itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return;
  const { error } = await serviceClient().from("items").delete().in("id", itemIds);
  if (error) throw new Error(`items delete: ${error.message}`);
}

export interface FixtureRowCounts {
  contributors: number;
  submissions: number;
  recommendations: number;
  recommendation_notifications: number;
  asks: number;
  items: number;
}

/** Before/after row counts for the fixture report (reads only). */
export async function fixtureRowCounts(): Promise<FixtureRowCounts> {
  const svc = serviceClient();
  const count = async (table: string, typeFilter?: string): Promise<number> => {
    const base = svc.from(table).select("*", { count: "exact", head: true });
    const { count: n, error } = typeFilter ? await base.eq("type", typeFilter) : await base;
    if (error) throw new Error(`${table} count: ${error.message}`);
    return n ?? 0;
  };
  return {
    contributors: await count("contributors"),
    submissions: await count("submissions"),
    recommendations: await count("recommendations"),
    recommendation_notifications: await count("notifications", "recommendation_received"),
    asks: await count("asks"),
    items: await count("items"),
  };
}

// ── Second authenticated identity (isolation proof) ─────────────────────
export interface FixtureUser {
  id: string;
  email: string;
  password: string;
}

/** Creates a throwaway auth user (zz-e2e- prefix); the 013 trigger also creates
 *  its public.users row. Removed by deleteFixtureUser. */
export async function createFixtureUser(): Promise<FixtureUser> {
  const email = `${FIXTURE_PREFIX}user-${Date.now()}@liked.test`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "no user"}`);
  return { id: data.user.id, email, password };
}

export async function signInFixtureUser(user: FixtureUser): Promise<string> {
  if (!SUPABASE_URL || !PUBLISHABLE_KEY) throw new Error("supabase url/key missing");
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  if (!res.ok) throw new Error(`fixture sign-in failed: HTTP ${res.status}`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

export async function deleteFixtureUser(user: FixtureUser): Promise<void> {
  const svc = serviceClient();
  await svc.from("users").delete().eq("id", user.id);
  const { error } = await svc.auth.admin.deleteUser(user.id);
  if (error) throw new Error(`deleteUser: ${error.message}`);
}

/** Direct authenticated RPC call with a given JWT (no app server involved). */
export async function rpcAs(
  accessToken: string,
  fn: string,
  args: Record<string, unknown> = {}
): Promise<{ status: number; body: unknown }> {
  if (!SUPABASE_URL || !PUBLISHABLE_KEY) throw new Error("supabase url/key missing");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

/** Anon (publishable key only, no session) RPC probe. */
export async function rpcAnon(
  fn: string,
  args: Record<string, unknown> = {}
): Promise<{ status: number; body: unknown }> {
  if (!SUPABASE_URL || !PUBLISHABLE_KEY) throw new Error("supabase url/key missing");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

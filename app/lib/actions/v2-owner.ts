"use server";

// v2 owner server actions (PLAN-V2-002 §2.5/§2.12): the owner's cookie-session
// Supabase client calls the class-O RPCs of migration 145 directly. Same
// pattern as sessionRpc in app/lib/actions/mvp2.ts. No owner/user id is ever
// passed — every RPC resolves auth.uid() server-side.

import { getSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AskRow,
  InboxPayload,
  UserPrefs,
} from "@/components/v2/inbox/inbox-utils";

type RpcArgs = Record<string, unknown>;

async function ownerRpc<T>(fn: string, args?: RpcArgs): Promise<T> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error("UNAUTHENTICATED");
  const { data, error } = await (
    supabase as unknown as {
      rpc: (f: string, a?: RpcArgs) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export interface InboxQuery {
  friendId?: string | null;
  cursor?: { key: number; item_id: string } | null;
  limit?: number;
}

/** get_inbox, To watch + recent only (P0 scope; Watched/Dismissed are P1). */
export async function getInboxAction(query: InboxQuery = {}): Promise<InboxPayload> {
  return ownerRpc<InboxPayload>("get_inbox", {
    p_status: "to_watch",
    p_friend_id: query.friendId ?? null,
    p_filters: {},
    p_sort: "recent",
    p_cursor_key: query.cursor?.key ?? null,
    p_cursor_item: query.cursor?.item_id ?? null,
    p_limit: query.limit ?? 30,
  });
}

/** ensure_my_ask on first load (PRD §6.1: one link per owner, created automatically). */
export async function ensureMyAskAction(): Promise<AskRow> {
  return ownerRpc<AskRow>("ensure_my_ask");
}

export async function getMyAskAction(): Promise<AskRow> {
  return ownerRpc<AskRow>("get_my_ask");
}

/** Rotates the token in place; the old link stops resolving immediately. */
export async function regenerateMyAskAction(): Promise<string> {
  return ownerRpc<string>("regenerate_my_ask");
}

export async function setAskActiveAction(active: boolean): Promise<void> {
  await ownerRpc<void>("set_ask_active", { p_active: active });
}

/** Defaults are returned when the owner has no user_prefs row (no write). */
export async function getMyPrefsAction(): Promise<UserPrefs> {
  return ownerRpc<UserPrefs>("get_my_prefs");
}

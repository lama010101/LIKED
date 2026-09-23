"use server";

/**
 * ONBOARD-001 — reduced-v1 onboarding orchestration (N3 ruling).
 *
 * All state reads/writes go through the auth-scoped migration-107 RPCs
 * (auth.uid() inside SQL — no caller-supplied user id). Folder creation
 * reuses the existing atomic create_folder_with_nodes RPC only.
 */

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { OnboardingFlags } from "@/lib/onboarding/predicates";

type RpcClient = {
  rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export async function getOnboardingState(): Promise<OnboardingFlags | null> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await (supabase as unknown as RpcClient).rpc("get_onboarding_state");
  if (error || !data || typeof data !== "object") return null;

  const d = data as Record<string, unknown>;
  return {
    imported: d.imported === true,
    dismissed: d.dismissed === true,
    youtubeConnected: d.youtube_connected === true,
    importCount: typeof d.import_count === "number" ? d.import_count : 0,
  };
}

export async function setOnboardingFlag(step: "imported" | "dismissed"): Promise<void> {
  const supabase = await getSupabaseServerClient();
  await (supabase as unknown as RpcClient).rpc("set_onboarding_flag", { p_step: step });
}

/**
 * CTA accept: create ONE folder (A4b — no per-category grouping) holding
 * every imported liked video. The node set is re-derived inside SQL at
 * call time, so an accept after a resumed/interrupted import still picks
 * up everything.
 */
export async function createOnboardingFolder(
  name: string
): Promise<{ ok: boolean; folderId?: string; count?: number; error?: string }> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not authenticated" };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Folder name is required." };

  const { data: ids, error: idsError } = await (supabase as unknown as RpcClient)
    .rpc("get_onboarding_import_node_ids");
  if (idsError) return { ok: false, error: idsError.message };

  const nodeIds = (ids as string[] | null) ?? [];
  if (nodeIds.length === 0) return { ok: false, error: "No imported videos found." };

  const { data: folderId, error } = await (supabase as unknown as RpcClient)
    .rpc("create_folder_with_nodes", {
      p_name: trimmed,
      p_parent_folder_id: null,
      p_node_ids: nodeIds,
      p_user_id: user.id, // existing RPC gate: must equal auth.uid()
    });
  if (error || !folderId) return { ok: false, error: error?.message ?? "Create folder failed." };

  await (supabase as unknown as RpcClient).rpc("set_onboarding_flag", { p_step: "dismissed" });
  revalidatePath("/feed");
  return { ok: true, folderId: folderId as string, count: nodeIds.length };
}

"use server";

/**
 * TEMPLATE-001 — folder template creation (PRD §11.3d).
 * Thin wrapper over the create_folder_template RPC (migration 109):
 * caller identity is auth.uid() inside SQL; the preset set is fixed.
 */

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export type TemplateKey = "read_later" | "watch_list" | "trip_planner" | "book_notes";

export async function createFolderTemplateAction(
  templateKey: TemplateKey,
  name?: string
): Promise<{ ok: boolean; folderId?: string; error?: string }> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "Not authenticated" };

    const { data, error } = await (supabase as unknown as {
      rpc: (fn: string, params: Record<string, unknown>) => Promise<{ data: string | null; error: { message: string } | null }>;
    }).rpc("create_folder_template", {
      p_template_key: templateKey,
      p_name: name?.trim() || null,
    });
    if (error || !data) return { ok: false, error: error?.message ?? "Template creation failed" };

    revalidatePath("/feed");
    return { ok: true, folderId: data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Template creation failed" };
  }
}

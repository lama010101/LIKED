"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { createFolder } from "@/lib/db/folders";
import { logger } from "@/lib/utils/logger";

export type CreateFolderResult =
  | { ok: true; folderId: string }
  | { ok: false; error: string };

export interface CreateFolderInput {
  name: string;
  parentFolderId?: string | null;
}

export async function createFolderAction(
  input: CreateFolderInput
): Promise<CreateFolderResult> {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  const name = input.name.trim();
  if (!name) {
    return { ok: false, error: "Folder name is required" };
  }
  if (name.length > 50) {
    return { ok: false, error: "Folder name must be 50 characters or less" };
  }

  try {
    const result = await createFolder({ name, parentFolderId: input.parentFolderId ?? null });
    revalidatePath("/feed");
    return { ok: true, folderId: result.id };
  } catch (err) {
    logger.error('[createFolderAction]', err)
    const message = err instanceof Error ? err.message : 'Failed to create folder'
    return { ok: false, error: message }
  }
}

'use server';

import { addTagToNode, addTagToFolder, createOrGetTag } from '@/lib/db/tags';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logger } from "@/lib/utils/logger";

export async function applyTagToNodeAction(
  tagId: string,
  nodeId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    await addTagToNode(tagId, nodeId);
    revalidatePath('/feed');
    return { ok: true };
  } catch (err) {
    logger.error('[applyTagToNodeAction] error:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/** §11.3b step 4 — folder tagging from Tag Mode. */
export async function applyTagToFolderAction(
  tagId: string,
  folderId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Not authenticated' };

    await addTagToFolder(tagId, folderId);
    revalidatePath('/feed');
    return { ok: true };
  } catch (err) {
    logger.error('[applyTagToFolderAction] error:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/** Tag Mode "+ New tag" input — create (or fetch) then return it. */
export async function createTagAction(
  label: string,
  languageCode = "en"
): Promise<{ ok: boolean; tag?: { id: string; label: string; color: string }; error?: string }> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Not authenticated' };
    const trimmed = label.trim();
    if (!trimmed) return { ok: false, error: 'Tag name is required' };

    const tag = await createOrGetTag(trimmed, languageCode);
    return { ok: true, tag: { id: tag.id, label: trimmed, color: tag.color_hex } };
  } catch (err) {
    logger.error('[createTagAction] error:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

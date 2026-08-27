'use server';

import { addTagToNode } from '@/lib/db/tags';
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

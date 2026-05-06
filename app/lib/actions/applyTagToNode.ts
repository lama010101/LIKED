'use server';

import { addTagToNode } from '@/lib/db/tags';

export async function applyTagToNodeAction(
  tagId: string,
  nodeId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    await addTagToNode(tagId, nodeId);
    return { ok: true };
  } catch (err) {
    console.error('[applyTagToNodeAction] error:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { removeNodeFromFolder } from '@/lib/db/folders';
import { revalidatePath } from 'next/cache';

export interface RemoveNodeFromFolderInput {
  nodeId: string;
  folderId: string;
}

export type RemoveNodeFromFolderResult =
  | { ok: true }
  | { ok: false; error: string };

export async function removeNodeFromFolderAction(
  input: RemoveNodeFromFolderInput
): Promise<RemoveNodeFromFolderResult> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  try {
    await removeNodeFromFolder(input.nodeId, input.folderId, user.id);
    revalidatePath('/feed');
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to remove card from folder';
    return { ok: false, error: message };
  }
}

'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { addNodeToFolder } from '@/lib/db/folders';
import { revalidatePath } from 'next/cache';

export interface AddNodeToFolderInput {
  nodeId: string;
  folderId: string;
}

export type AddNodeToFolderResult =
  | { ok: true }
  | { ok: false; error: string };

export async function addNodeToFolderAction(
  input: AddNodeToFolderInput
): Promise<AddNodeToFolderResult> {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authenticated' };

  try {
    await addNodeToFolder(input.nodeId, input.folderId, user.id);
    revalidatePath('/feed');
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to assign card to folder';
    return { ok: false, error: message };
  }
}

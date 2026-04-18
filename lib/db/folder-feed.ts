import { VisibleNode } from '@/lib/db/visibility';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function getNodesInFolder(
  userId: string,
  folderId: string
): Promise<VisibleNode[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase.rpc('get_nodes_in_folder', {
    p_user_id: userId,
    p_folder_id: folderId,
  });

  if (error) {
    throw error;
  }

  return data ?? [];
}

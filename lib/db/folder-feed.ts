import { VisibleNode } from '@/lib/db/visibility';
import { getSupabaseServerClient } from '@/lib/supabase/server';

export async function getNodesInFolder(
  userId: string,
  folderId: string,
  sort: string = 'newest'
): Promise<VisibleNode[]> {
  const supabase = await getSupabaseServerClient();

  const { data, error } = await supabase.rpc('get_nodes_in_folder', {
    p_user_id: userId,
    p_folder_id: folderId,
    p_sort: sort,
  });

  if (error) {
    throw error;
  }

  return (data as VisibleNode[] | null) ?? [];
}

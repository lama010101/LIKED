'use server';

import { getUserFolders } from '@/lib/db/folders';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from "@/lib/utils/logger";

export async function getUserFoldersAction(): Promise<Array<{ id: string; name: string; color_hex: string; parent_folder_id: string | null }>> {
  try {
    // Auth check: return empty for unauthenticated users (AUDIT-06 P3-1).
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    const folders = await getUserFolders();
    return folders.map(f => ({
      id: f.id,
      name: f.name,
      color_hex: f.color_hex,
      parent_folder_id: f.parent_folder_id,
    }));
  } catch (err) {
    logger.error('[getFoldersAction] error:', err);
    return [];
  }
}

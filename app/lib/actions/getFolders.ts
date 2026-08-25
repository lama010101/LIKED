'use server';

import { getUserFolders } from '@/lib/db/folders';

export async function getUserFoldersAction(): Promise<Array<{ id: string; name: string; color_hex: string; parent_folder_id: string | null }>> {
  try {
    const folders = await getUserFolders();
    return folders.map(f => ({
      id: f.id,
      name: f.name,
      color_hex: f.color_hex,
      parent_folder_id: f.parent_folder_id,
    }));
  } catch (err) {
    console.error('[getFoldersAction] error:', err);
    return [];
  }
}

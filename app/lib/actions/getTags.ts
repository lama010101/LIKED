'use server';

import { getVisibleTags } from '@/lib/db/tags';
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { logger } from "@/lib/utils/logger";

export async function getTagsAction(
  languageCode: string
): Promise<Array<{ id: string; label: string; color_hex: string }>> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return [];
    const tags = await getVisibleTags(user.id, languageCode || 'en');
    return tags.map(t => ({
      id: t.id,
      label: t.label,
      color_hex: t.color_hex,
    }));
  } catch (err) {
    logger.error('[getTagsAction] error:', err);
    return [];
  }
}

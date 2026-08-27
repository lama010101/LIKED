'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logger } from "@/lib/utils/logger";

export interface CardPosition {
  node_id: string;
  folder_id: string | null;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
}

export async function getCardPositionsAction(folderId: string | null): Promise<CardPosition[]> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return [];

    let query = supabase
      .from('card_positions')
      .select('node_id, folder_id, pos_x, pos_y, width, height')
      .eq('user_id', user.id);

    if (folderId) {
      query = query.eq('folder_id', folderId);
    } else {
      query = query.is('folder_id', null);
    }

    const { data, error: queryError } = await query;
    if (queryError) {
      logger.error('[getCardPositionsAction] error:', queryError);
      return [];
    }

    return (data ?? []) as CardPosition[];
  } catch (err) {
    logger.error('[getCardPositionsAction] error:', err);
    return [];
  }
}

export async function upsertCardPositionAction(
  nodeId: string,
  folderId: string | null,
  posX: number,
  posY: number,
  width: number,
  height: number
): Promise<boolean> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return false;

    const { error: rpcError } = await supabase.rpc('upsert_card_position', {
      p_node_id: nodeId,
      p_folder_id: folderId,
      p_pos_x: posX,
      p_pos_y: posY,
      p_width: width,
      p_height: height,
    });

    if (rpcError) {
      logger.error('[upsertCardPositionAction] RPC error:', rpcError);
      return false;
    }

    revalidatePath('/feed');
    return true;
  } catch (err) {
    logger.error('[upsertCardPositionAction] error:', err);
    return false;
  }
}

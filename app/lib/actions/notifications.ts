'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logger } from "@/lib/utils/logger";

export interface NotificationItem {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
}

export async function getNotificationsAction(): Promise<NotificationItem[]> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return [];

    const { data, error: queryError } = await supabase
      .from('notifications')
      .select('id, type, payload, read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (queryError) {
      logger.error('[getNotificationsAction] query error:', queryError);
      return [];
    }

    return (data ?? []) as NotificationItem[];
  } catch (err) {
    logger.error('[getNotificationsAction] error:', err);
    return [];
  }
}

export async function getUnreadNotificationCountAction(): Promise<number> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return 0;

    const { count, error: queryError } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('read', false);

    if (queryError) {
      logger.error('[getUnreadNotificationCountAction] query error:', queryError);
      return 0;
    }

    return count ?? 0;
  } catch (err) {
    logger.error('[getUnreadNotificationCountAction] error:', err);
    return 0;
  }
}

export async function markNotificationReadAction(notificationId: string): Promise<boolean> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return false;

    const { error: updateError } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('user_id', user.id);

    if (updateError) {
      logger.error('[markNotificationReadAction] error:', updateError);
      return false;
    }

    revalidatePath('/feed');
    return true;
  } catch (err) {
    logger.error('[markNotificationReadAction] error:', err);
    return false;
  }
}

export async function markAllNotificationsReadAction(): Promise<boolean> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return false;

    const { error: updateError } = await supabase
      .from('notifications')
      .update({ read: true })
      .eq('user_id', user.id)
      .eq('read', false);

    if (updateError) {
      logger.error('[markAllNotificationsReadAction] error:', updateError);
      return false;
    }

    revalidatePath('/feed');
    return true;
  } catch (err) {
    logger.error('[markAllNotificationsReadAction] error:', err);
    return false;
  }
}

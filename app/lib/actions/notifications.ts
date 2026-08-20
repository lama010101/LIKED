'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';

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
      console.error('[getNotificationsAction] query error:', queryError);
      return [];
    }

    return (data ?? []) as NotificationItem[];
  } catch (err) {
    console.error('[getNotificationsAction] error:', err);
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
      console.error('[getUnreadNotificationCountAction] query error:', queryError);
      return 0;
    }

    return count ?? 0;
  } catch (err) {
    console.error('[getUnreadNotificationCountAction] error:', err);
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
      console.error('[markNotificationReadAction] error:', updateError);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[markNotificationReadAction] error:', err);
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
      console.error('[markAllNotificationsReadAction] error:', updateError);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[markAllNotificationsReadAction] error:', err);
    return false;
  }
}

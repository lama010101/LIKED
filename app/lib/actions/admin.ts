'use server';

import { getSupabaseServerClient } from '@/lib/supabase/server';

export interface AdminEntry {
  user_id: string;
  granted_by: string;
}

export type GrantAdminResult =
  | { ok: true }
  | { ok: false; error: string };

export async function grantFolderAdminAction(
  folderId: string,
  targetUserId: string
): Promise<GrantAdminResult> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { ok: false, error: 'Not authenticated.' };

    const { error: rpcError } = await supabase.rpc('grant_folder_admin', {
      p_folder_id: folderId,
      p_target_user_id: targetUserId,
    });

    if (rpcError) {
      return { ok: false, error: rpcError.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function grantGroupAdminAction(
  groupId: string,
  targetUserId: string
): Promise<GrantAdminResult> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { ok: false, error: 'Not authenticated.' };

    const { error: rpcError } = await supabase.rpc('grant_group_admin', {
      p_group_id: groupId,
      p_target_user_id: targetUserId,
    });

    if (rpcError) {
      return { ok: false, error: rpcError.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function revokeFolderAdminAction(
  folderId: string,
  targetUserId: string
): Promise<GrantAdminResult> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { ok: false, error: 'Not authenticated.' };

    const { error: rpcError } = await supabase.rpc('revoke_folder_admin', {
      p_folder_id: folderId,
      p_target_user_id: targetUserId,
    });

    if (rpcError) {
      return { ok: false, error: rpcError.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function revokeGroupAdminAction(
  groupId: string,
  targetUserId: string
): Promise<GrantAdminResult> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return { ok: false, error: 'Not authenticated.' };

    const { error: rpcError } = await supabase.rpc('revoke_group_admin', {
      p_group_id: groupId,
      p_target_user_id: targetUserId,
    });

    if (rpcError) {
      return { ok: false, error: rpcError.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function getFolderAdminsAction(folderId: string): Promise<AdminEntry[]> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return [];

    const { data, error: queryError } = await supabase
      .from('folder_admins')
      .select('user_id, granted_by')
      .eq('folder_id', folderId);

    if (queryError) {
      console.error('[getFolderAdminsAction] error:', queryError);
      return [];
    }

    return (data ?? []) as AdminEntry[];
  } catch (err) {
    console.error('[getFolderAdminsAction] error:', err);
    return [];
  }
}

export async function getGroupAdminsAction(groupId: string): Promise<AdminEntry[]> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return [];

    const { data, error: queryError } = await supabase
      .from('group_admins')
      .select('user_id, granted_by')
      .eq('group_id', groupId);

    if (queryError) {
      console.error('[getGroupAdminsAction] error:', queryError);
      return [];
    }

    return (data ?? []) as AdminEntry[];
  } catch (err) {
    console.error('[getGroupAdminsAction] error:', err);
    return [];
  }
}

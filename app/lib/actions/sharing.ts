"use server";

import { directShare, shareFolder, groupShare } from "@/lib/db/sharing";
import {
  hasNodePermission,
  hasFolderPermission,
  getEffectiveNodePermission,
  getEffectiveFolderPermission,
} from "@/lib/db/permissions";
import type { Permission } from "@/lib/types/app";
import { getSupabaseServerClient } from "@/lib/supabase/server";

async function getActorId(): Promise<string> {
  const supabase = await getSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("UNAUTHORIZED");
  return user.id;
}

export async function directShareAction(input: {
  nodeId: string;
  targetUserId: string;
  permission?: string;
}): Promise<string> {
  const actorId = await getActorId();
  return directShare({ sharerId: actorId, ...input });
}

export async function shareFolderAction(input: {
  folderId: string;
  targetUserIds: string[];
  permission?: string;
}): Promise<string> {
  const actorId = await getActorId();
  return shareFolder({ sharerId: actorId, ...input });
}

export async function groupShareAction(
  nodeId: string,
  groupId: string
): Promise<string> {
  const actorId = await getActorId();
  return groupShare(actorId, nodeId, groupId);
}

export async function hasNodePermissionAction(
  nodeId: string,
  required: Permission
): Promise<boolean> {
  try {
    const actorId = await getActorId();
    return await hasNodePermission(actorId, nodeId, required);
  } catch {
    return false;
  }
}

export async function hasFolderPermissionAction(
  folderId: string,
  required: Permission
): Promise<boolean> {
  try {
    const actorId = await getActorId();
    return await hasFolderPermission(actorId, folderId, required);
  } catch {
    return false;
  }
}

export async function getEffectiveNodePermissionAction(
  nodeId: string
): Promise<Permission | null> {
  try {
    const actorId = await getActorId();
    return await getEffectiveNodePermission(actorId, nodeId);
  } catch {
    return null;
  }
}

export async function getEffectiveFolderPermissionAction(
  folderId: string
): Promise<Permission | null> {
  try {
    const actorId = await getActorId();
    return await getEffectiveFolderPermission(actorId, folderId);
  } catch {
    return null;
  }
}

"use server";

import { directShare, shareFolder, groupShare } from "@/lib/db/sharing";
import {
  hasNodePermission,
  hasFolderPermission,
  getEffectiveNodePermission,
  getEffectiveFolderPermission,
} from "@/lib/db/permissions";
import type { Permission } from "@/lib/types/app";

export async function directShareAction(input: {
  sharerId: string;
  nodeId: string;
  targetUserId: string;
  permission?: string;
}): Promise<string> {
  return directShare(input);
}

export async function shareFolderAction(input: {
  sharerId: string;
  folderId: string;
  targetUserIds: string[];
  permission?: string;
}): Promise<string> {
  return shareFolder(input);
}

export async function groupShareAction(
  sharerId: string,
  nodeId: string,
  groupId: string
): Promise<string> {
  return groupShare(sharerId, nodeId, groupId);
}

export async function hasNodePermissionAction(
  userId: string,
  nodeId: string,
  required: Permission
): Promise<boolean> {
  return hasNodePermission(userId, nodeId, required);
}

export async function hasFolderPermissionAction(
  userId: string,
  folderId: string,
  required: Permission
): Promise<boolean> {
  return hasFolderPermission(userId, folderId, required);
}

export async function getEffectiveNodePermissionAction(
  userId: string,
  nodeId: string
): Promise<Permission | null> {
  return getEffectiveNodePermission(userId, nodeId);
}

export async function getEffectiveFolderPermissionAction(
  userId: string,
  folderId: string
): Promise<Permission | null> {
  return getEffectiveFolderPermission(userId, folderId);
}

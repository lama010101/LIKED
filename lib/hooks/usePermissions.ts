"use client";

import { useState, useEffect, useCallback } from "react";
import {
  hasNodePermissionAction,
  hasFolderPermissionAction,
  getEffectiveNodePermissionAction,
  getEffectiveFolderPermissionAction,
} from "@/app/lib/actions/sharing";
import type { Permission } from "@/lib/types/app";

/**
 * Hook to check node permission for current user
 *
 * Per P13-T01 F4: Edit affordances gating
 * - Card title/URL inline edit: visible to owner OR getEffectiveNodePermission >= 'edit'
 * - Trash/delete: owner only
 */
export function useNodePermission(
  userId: string | null,
  nodeId: string | null,
  required: Permission
): {
  hasPermission: boolean;
  isLoading: boolean;
  effectivePermission: Permission | null;
  refetch: () => void;
} {
  const [hasPermission, setHasPermission] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [effectivePermission, setEffectivePermission] = useState<Permission | null>(null);

  const check = useCallback(async () => {
    if (!userId || !nodeId) {
      setHasPermission(false);
      setEffectivePermission(null);
      return;
    }

    setIsLoading(true);
    try {
      const [has, effective] = await Promise.all([
        hasNodePermissionAction(nodeId, required),
        getEffectiveNodePermissionAction(nodeId),
      ]);
      setHasPermission(has);
      setEffectivePermission(effective);
    } catch (err) {
      console.error("Failed to check node permission:", err);
      setHasPermission(false);
      setEffectivePermission(null);
    } finally {
      setIsLoading(false);
    }
  }, [userId, nodeId, required]);

  useEffect(() => {
    check();
  }, [check]);

  return {
    hasPermission,
    isLoading,
    effectivePermission,
    refetch: check,
  };
}

/**
 * Hook to check folder permission for current user
 *
 * Per P13-T01 F4: Edit affordances gating
 * - Folder rename: visible to owner OR getEffectiveFolderPermission >= 'edit'
 * - "Share folder" action: visible to owner OR >= 'admin'
 * - "Add to folder" action: visible to owner OR >= 'contribute'
 * - Trash/delete: owner or folder 'admin'
 */
export function useFolderPermission(
  userId: string | null,
  folderId: string | null,
  required: Permission
): {
  hasPermission: boolean;
  isLoading: boolean;
  effectivePermission: Permission | null;
  refetch: () => void;
} {
  const [hasPermission, setHasPermission] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [effectivePermission, setEffectivePermission] = useState<Permission | null>(null);

  const check = useCallback(async () => {
    if (!userId || !folderId) {
      setHasPermission(false);
      setEffectivePermission(null);
      return;
    }

    setIsLoading(true);
    try {
      const [has, effective] = await Promise.all([
        hasFolderPermissionAction(folderId, required),
        getEffectiveFolderPermissionAction(folderId),
      ]);
      setHasPermission(has);
      setEffectivePermission(effective);
    } catch (err) {
      console.error("Failed to check folder permission:", err);
      setHasPermission(false);
      setEffectivePermission(null);
    } finally {
      setIsLoading(false);
    }
  }, [userId, folderId, required]);

  useEffect(() => {
    check();
  }, [check]);

  return {
    hasPermission,
    isLoading,
    effectivePermission,
    refetch: check,
  };
}

/**
 * Hook to check if user can edit a node
 * Shortcut for useNodePermission with 'edit' requirement
 */
export function useCanEditNode(
  userId: string | null,
  nodeId: string | null
): boolean {
  const { hasPermission } = useNodePermission(userId, nodeId, "edit");
  return hasPermission;
}

/**
 * Hook to check if user can edit a folder
 * Shortcut for useFolderPermission with 'edit' requirement
 */
export function useCanEditFolder(
  userId: string | null,
  folderId: string | null
): boolean {
  const { hasPermission } = useFolderPermission(userId, folderId, "edit");
  return hasPermission;
}

/**
 * Hook to check if user can share a folder (requires admin)
 */
export function useCanShareFolder(
  userId: string | null,
  folderId: string | null
): boolean {
  const { hasPermission } = useFolderPermission(userId, folderId, "admin");
  return hasPermission;
}

/**
 * Hook to check if user can add to a folder (requires contribute)
 */
export function useCanAddToFolder(
  userId: string | null,
  folderId: string | null
): boolean {
  const { hasPermission } = useFolderPermission(userId, folderId, "contribute");
  return hasPermission;
}

"use client";

import { useState, useCallback } from "react";
import { directShare, FolderShareInput, shareFolder } from "@/lib/db/sharing";
import { hasNodePermission } from "@/lib/db/permissions";
import { Permission } from "@/lib/types/app";
import {
  PermissionSelector,
  NODE_PERMISSION_OPTIONS,
  FOLDER_PERMISSION_OPTIONS,
  getPermissionLabel,
} from "@/components/ui/PermissionSelector";

type ShareType = "node" | "folder";

interface SharePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareType: ShareType;
  itemId: string; // nodeId or folderId
  itemName: string;
  currentUserId: string;
  availableUsers: { id: string; display_name: string | null; avatar_key: string | null }[];
  onShareComplete?: () => void;
}

/**
 * Share Picker Modal
 *
 * Per P13-T01 F1:
 * - For node shares: show permission selector with 4 options:
 *   "View only" | "Can comment" | "Can edit" | "Can reshare"
 *   Default: "View only"
 * - For folder/project shares: show:
 *   "View only" | "Can contribute" | "Can edit" | "Admin"
 *   Default: "View only"
 * - Comment option renders greyed with tooltip: "Available when comments launch"
 */
export function SharePickerModal({
  isOpen,
  onClose,
  shareType,
  itemId,
  itemName,
  currentUserId,
  availableUsers,
  onShareComplete,
}: SharePickerModalProps) {
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [permission, setPermission] = useState<Permission>("view");
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggleUser = useCallback((userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId]
    );
  }, []);

  const handleShare = async () => {
    if (selectedUserIds.length === 0) return;

    setIsSharing(true);
    setError(null);

    try {
      if (shareType === "node") {
        // Share node to each selected user
        // First verify we have permission to share
        const canShare = await hasNodePermission(currentUserId, itemId, "reshare");
        if (!canShare) {
          throw new Error("You don't have permission to share this node");
        }

        // Share to each user
        for (const targetUserId of selectedUserIds) {
          await directShare({
            sharerId: currentUserId,
            nodeId: itemId,
            targetUserId,
            permission,
          });
        }
      } else {
        // Share folder
        const folderShareInput: FolderShareInput = {
          sharerId: currentUserId,
          folderId: itemId,
          targetUserIds: selectedUserIds,
          permission,
        };
        await shareFolder(folderShareInput);
      }

      // Reset and close
      setSelectedUserIds([]);
      setPermission("view");
      onShareComplete?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Share failed");
    } finally {
      setIsSharing(false);
    }
  };

  if (!isOpen) return null;

  const permissionOptions =
    shareType === "node" ? NODE_PERMISSION_OPTIONS : FOLDER_PERMISSION_OPTIONS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">
            Share {shareType === "node" ? "Card" : "Project"}
          </h3>
          <p className="text-sm text-gray-500 mt-1 truncate">{itemName}</p>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Error */}
          {error && (
            <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg">
              {error}
            </div>
          )}

          {/* Permission selector */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Permission level
            </label>
            <PermissionSelector
              value={permission}
              onChange={setPermission}
              options={permissionOptions}
            />
            <p className="text-xs text-gray-500 mt-2">
              Selected: {getPermissionLabel(permission)}
            </p>
          </div>

          {/* User selection */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              Share with ({selectedUserIds.length} selected)
            </label>
            <div className="max-h-48 overflow-y-auto space-y-1 border border-gray-100 rounded-lg p-2">
              {availableUsers.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-4">
                  No users available to share with
                </p>
              ) : (
                availableUsers.map((user) => {
                  const isSelected = selectedUserIds.includes(user.id);
                  return (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleToggleUser(user.id)}
                      className={[
                        "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                        isSelected
                          ? "bg-amber-50 hover:bg-amber-100"
                          : "hover:bg-gray-50",
                      ].join(" ")}
                    >
                      {/* Checkbox */}
                      <div
                        className={[
                          "w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                          isSelected
                            ? "bg-amber-500 border-amber-500"
                            : "border-gray-300",
                        ].join(" ")}
                      >
                        {isSelected && (
                          <svg
                            className="w-3.5 h-3.5 text-white"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={3}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>

                      {/* Avatar placeholder */}
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
                        {user.display_name?.charAt(0).toUpperCase() ?? "?"}
                      </div>

                      {/* Name */}
                      <span className="flex-1 text-sm font-medium text-gray-900">
                        {user.display_name ?? "Unknown"}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-gray-50 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={selectedUserIds.length === 0 || isSharing}
            className={[
              "flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg",
              selectedUserIds.length === 0 || isSharing
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-amber-500 hover:bg-amber-600",
            ].join(" ")}
          >
            {isSharing
              ? "Sharing..."
              : `Share with ${selectedUserIds.length || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

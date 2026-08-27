"use client";

import { useState, useCallback } from "react";
import { directShareAction, shareFolderAction, hasNodePermissionAction } from "@/app/lib/actions/sharing";
import { Permission } from "@/lib/types/app";
import {
  PermissionSelector,
  NODE_PERMISSION_OPTIONS,
  FOLDER_PERMISSION_OPTIONS,
  getPermissionLabel,
} from "@/components/ui/PermissionSelector";

interface FolderShareInput {
  folderId: string;
  targetUserIds: string[];
  permission?: string;
}

type ShareType = "node" | "folder";

interface SharePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareType: ShareType;
  itemId: string; // nodeId or folderId
  itemName: string;
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
        const canShare = await hasNodePermissionAction(itemId, "reshare");
        if (!canShare) {
          throw new Error("You don't have permission to share this node");
        }

        // Share to each user
        for (const targetUserId of selectedUserIds) {
          const result = await directShareAction({
            nodeId: itemId,
            targetUserId,
            permission,
          });
          if (!result.ok) {
            throw new Error(result.error);
          }
        }
      } else {
        // Share folder
        const folderShareInput: FolderShareInput = {
          folderId: itemId,
          targetUserIds: selectedUserIds,
          permission,
        };
        const result = await shareFolderAction(folderShareInput);
        if (!result.ok) {
          throw new Error(result.error);
        }
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
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} role="dialog" aria-modal="true" aria-label={`Share ${itemName}`}>
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
        }}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        style={{
          position: 'relative',
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          borderRadius: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
          width: '100%',
          maxWidth: '448px',
          margin: '16px',
          overflow: 'hidden',
        }}>
        {/* Header */}
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-1)' }}>
          <h3 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-1)' }}>
            Share {shareType === "node" ? "Card" : "Project"}
          </h3>
          <p style={{ fontSize: 14, color: 'var(--text-3)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{itemName}</p>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Error */}
          {error && (
            <div style={{ padding: 12, background: 'rgba(220, 38, 38, 0.1)', color: 'var(--red, #dc2626)', fontSize: 14, borderRadius: 8 }}>
              {error}
            </div>
          )}

          {/* Permission selector */}
          <div>
            <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', marginBottom: 8, display: 'block' }}>
              Permission level
            </label>
            <PermissionSelector
              value={permission}
              onChange={setPermission}
              options={permissionOptions}
            />
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
              Selected: {getPermissionLabel(permission)}
            </p>
          </div>

          {/* User selection */}
          <div>
            <label style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-1)', marginBottom: 8, display: 'block' }}>
              Share with ({selectedUserIds.length} selected)
            </label>
            <div style={{ maxHeight: 192, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, border: '1px solid var(--border-1)', borderRadius: 8, padding: 8 }}>
              {availableUsers.length === 0 ? (
                <p style={{ fontSize: 14, color: 'var(--text-3)', textAlign: 'center', padding: 16 }}>
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
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '8px 12px',
                        borderRadius: 8,
                        textAlign: 'left',
                        transition: 'background-color 0.15s',
                        background: isSelected ? 'rgba(245, 158, 11, 0.1)' : 'transparent',
                      }}
                    >
                      {/* Checkbox */}
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 4,
                          border: '2px solid',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s',
                          background: isSelected ? 'var(--accent)' : 'transparent',
                          borderColor: isSelected ? 'var(--accent)' : 'var(--border-1)',
                        }}
                      >
                        {isSelected && (
                          <svg
                            style={{ width: 14, height: 14, color: '#fff' }}
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
                      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, color: 'var(--text-2)' }}>
                        {user.display_name?.charAt(0).toUpperCase() ?? "?"}
                      </div>

                      {/* Name */}
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text-1)' }}>
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
        <div style={{ padding: '20px', background: 'var(--surface-1)', display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 500,
              color: 'var(--text-1)',
              background: 'var(--surface-2)',
              border: '1px solid var(--border-1)',
              borderRadius: 8,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={selectedUserIds.length === 0 || isSharing}
            style={{
              flex: 1,
              padding: '8px 16px',
              fontSize: 14,
              fontWeight: 500,
              color: '#fff',
              borderRadius: 8,
              background: selectedUserIds.length === 0 || isSharing ? 'var(--text-3)' : 'var(--accent)',
              cursor: selectedUserIds.length === 0 || isSharing ? 'not-allowed' : 'pointer',
            }}
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

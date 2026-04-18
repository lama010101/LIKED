"use client";

import { Permission } from "@/lib/types/app";

export interface PermissionOption {
  value: Permission;
  label: string;
  description?: string;
  disabled?: boolean;
}

interface PermissionSelectorProps {
  value: Permission;
  onChange: (permission: Permission) => void;
  options: PermissionOption[];
  size?: "sm" | "md";
  showTooltip?: boolean;
}

/**
 * Permission Selector Component
 *
 * Shows permission options as selectable pills.
 * Supports disabled options with tooltips for future features.
 *
 * Per P13-T01 F1:
 * - For node shares: "View only" | "Can comment" | "Can edit" | "Can reshare"
 * - For folder/project shares: "View only" | "Can contribute" | "Can edit" | "Admin"
 * - Comment option renders greyed with tooltip: "Available when comments launch"
 */
export function PermissionSelector({
  value,
  onChange,
  options,
  size = "md",
}: PermissionSelectorProps) {
  const sizeClasses = size === "sm" 
    ? "px-2 py-1 text-xs" 
    : "px-3 py-1.5 text-sm";

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = value === option.value;
        const isDisabled = option.disabled;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => !isDisabled && onChange(option.value)}
            disabled={isDisabled}
            className={[
              "rounded-full font-medium transition-all duration-150",
              sizeClasses,
              isSelected && !isDisabled
                ? "bg-amber-500 text-white shadow-sm"
                : isDisabled
                ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200",
            ].join(" ")}
            title={option.description}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Node permission options for share dialog
 * Per P13-T01 F1: "View only" | "Can comment" | "Can edit" | "Can reshare"
 * Comment is greyed with tooltip for future feature
 */
export const NODE_PERMISSION_OPTIONS: PermissionOption[] = [
  { value: "view", label: "View only" },
  { 
    value: "comment", 
    label: "Can comment",
    description: "Available when comments launch",
    disabled: true,
  },
  { value: "edit", label: "Can edit" },
  { value: "reshare", label: "Can reshare" },
];

/**
 * Folder permission options for share dialog
 * Per P13-T01 F1: "View only" | "Can contribute" | "Can edit" | "Admin"
 * 'comment' and 'reshare' are invalid for folders
 */
export const FOLDER_PERMISSION_OPTIONS: PermissionOption[] = [
  { value: "view", label: "View only" },
  { value: "contribute", label: "Can contribute" },
  { value: "edit", label: "Can edit" },
  { value: "admin", label: "Admin" },
];

/**
 * Get display label for a permission value
 */
export function getPermissionLabel(permission: Permission): string {
  const labels: Record<Permission, string> = {
    view: "View only",
    comment: "Can comment",
    contribute: "Can contribute",
    edit: "Can edit",
    reshare: "Can reshare",
    admin: "Admin",
  };
  return labels[permission] ?? permission;
}

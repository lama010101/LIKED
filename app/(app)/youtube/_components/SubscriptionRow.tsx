"use client";

import Image from "next/image";

/**
 * SubscriptionRow — extracted from youtube/page.tsx
 * Renders a single YouTube subscription with Unsubscribe action.
 */

export interface YouTubeSubscription {
  id: string;
  title: string;
  thumbnail: string;
  channelId: string;
}

export interface SubscriptionRowProps {
  subscription: YouTubeSubscription;
  confirmUnsub: boolean;
  onConfirmUnsub: () => void;
  onCancelUnsub: () => void;
  onUnsubscribe: () => void;
}

export default function SubscriptionRow({
  subscription,
  confirmUnsub,
  onConfirmUnsub,
  onCancelUnsub,
  onUnsubscribe,
}: SubscriptionRowProps) {
  return (
    <div style={{
      display: "flex",
      gap: 12,
      padding: 12,
      background: "var(--surface-2, #f9f9f9)",
      borderRadius: 12,
      border: "1px solid var(--border-1, #f0f0f0)",
    }}>
      {/* Avatar */}
      {subscription.thumbnail && (
        <Image
          src={subscription.thumbnail}
          alt={subscription.title}
          width={48}
          height={48}
          unoptimized
          style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
        />
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text-1, #111)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {subscription.title}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {confirmUnsub ? (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--red, #ef4444)" }}>Confirm?</span>
              <button
                onClick={onUnsubscribe}
                style={{
                  padding: "4px 10px",
                  background: "var(--red, #ef4444)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Yes, unsubscribe
              </button>
              <button
                onClick={onCancelUnsub}
                style={{
                  padding: "4px 10px",
                  background: "var(--surface-3)",
                  border: "1px solid var(--border-1)",
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-2)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={onConfirmUnsub}
              style={{
                padding: "4px 10px",
                background: "transparent",
                border: "1px solid var(--border-1, #e5e7eb)",
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                color: "var(--text-2, #666)",
                cursor: "pointer",
              }}
            >
              Unsubscribe
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

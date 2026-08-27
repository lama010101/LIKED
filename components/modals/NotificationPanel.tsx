'use client';

import { useState, useEffect, useCallback } from 'react';

import {
  getNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
  type NotificationItem,
} from '@/app/lib/actions/notifications';

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
  onUnreadCountChange: (count: number) => void;
}

export default function NotificationPanel({ open, onClose, onUnreadCountChange }: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(open);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getNotificationsAction().then((items) => {
      if (cancelled) return;
      setNotifications(items);
      setLoading(false);
      const unread = items.filter((n) => !n.read).length;
      onUnreadCountChange(unread);
    }).catch(() => {
      if (!cancelled) {
        setNotifications([]);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [open, onUnreadCountChange]);

  const handleMarkRead = useCallback(async (id: string) => {
    await markNotificationReadAction(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    onUnreadCountChange(notifications.filter((n) => n.id !== id && !n.read).length);
  }, [notifications, onUnreadCountChange]);

  const handleMarkAllRead = useCallback(async () => {
    await markAllNotificationsReadAction();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    onUnreadCountChange(0);
  }, [onUnreadCountChange]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 90,
          background: 'rgba(0,0,0,0.3)',
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(400px, 100vw)',
          background: 'var(--surface-1, #fff)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border, #e5e7eb)',
            flexShrink: 0,
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, fontFamily: 'var(--font-serif, Georgia, serif)' }}>
            Notifications
          </h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {notifications.some((n) => !n.read) && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--accent, #7c5cfc)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '4px 8px',
                }}
              >
                Mark all read
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-2, #666)',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3, #999)', fontSize: 14 }}>
              Loading…
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3, #999)', fontSize: 14 }}>
              No notifications yet
            </div>
          ) : (
            notifications.map((n) => (
              <NotificationRow key={n.id} notification={n} onMarkRead={handleMarkRead} />
            ))
          )}
        </div>
      </div>
    </>
  );
}

function NotificationRow({
  notification,
  onMarkRead,
}: {
  notification: NotificationItem;
  onMarkRead: (id: string) => void;
}) {
  const typeLabel = getNotificationTypeLabel(notification.type);
  const icon = getNotificationIcon(notification.type);

  return (
    <div
      onClick={() => !notification.read && onMarkRead(notification.id)}
      style={{
        display: 'flex',
        gap: 12,
        padding: '14px 20px',
        borderBottom: '1px solid var(--border, #f0f0f0)',
        cursor: notification.read ? 'default' : 'pointer',
        background: notification.read ? 'transparent' : 'rgba(124, 92, 252, 0.04)',
        transition: 'background 0.15s',
      }}
    >
      <div style={{ flexShrink: 0, color: 'var(--accent, #7c5cfc)', marginTop: 2 }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text, #111)', marginBottom: 2 }}>
          {typeLabel}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3, #999)' }}>
          {formatRelativeTime(notification.created_at)}
        </div>
      </div>
      {!notification.read && (
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: 'var(--accent, #7c5cfc)',
          flexShrink: 0,
          marginTop: 6,
        }} />
      )}
    </div>
  );
}

function getNotificationTypeLabel(type: string): string {
  switch (type) {
    case 'share_received':
      return 'New card shared with you';
    case 'group_share':
      return 'Card shared to your group';
    case 'folder_share':
      return 'Folder shared with you';
    default:
      return 'Notification';
  }
}

function getNotificationIcon(type: string) {
  const size = 20;
  switch (type) {
    case 'share_received':
    case 'group_share':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
      );
    case 'folder_share':
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    default:
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      );
  }
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}

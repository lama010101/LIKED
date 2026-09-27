"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { NotificationRow } from "@/app/lib/actions/mvp2";
import { markNotificationsReadAction } from "@/app/lib/actions/mvp2";
import { toast } from "@/lib/store/toastStore";

/** Notification list (Phase 9): mark-all-read + per-type rendering.
 *  Payload shape (RPC-emitted): {folder_name|item, name|sender, permission...}. */
export default function NotificationsView({ items }: { items: NotificationRow[] }) {
  const t = useTranslations();
  const router = useRouter();

  const markAll = async () => {
    try { await markNotificationsReadAction(null); router.refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : t("common.error")); }
  };

  const text = (n: NotificationRow): string => {
    const p = n.payload ?? {};
    const name = String(p.name ?? p.sender_name ?? p.sender_id ?? "").slice(0, 24);
    const item = String(p.item ?? p.item_name ?? p.node_title ?? p.folder_name ?? "");
    const folder = String(p.folder ?? p.folder_name ?? "");
    const permission = String(p.permission ?? "");
    switch (n.type) {
      case "share_received": return t("notifications.shareReceived", { name });
      case "folder_share": return t("notifications.folderShared", { name, folder });
      case "permission_changed": return t("notifications.permissionChanged", { item: item || folder, permission });
      case "item_added": return t("notifications.itemAdded", { name, item, folder });
      default: return n.type;
    }
  };

  const linkFor = (n: NotificationRow): string | null => {
    const p = n.payload ?? {};
    if (p.folder_id) return `/folders/${p.folder_id}`;
    if (p.node_id) return `/card/${p.node_id}`;
    return null;
  };

  return (
    <div className="notifs-view">
      <div className="feed-head">
        <h1 className="sec-title">{t("notifications.title")}</h1>
        <button className="btn" onClick={markAll}>{t("notifications.markAllRead")}</button>
      </div>
      {items.length === 0 && <p className="empty-note">{t("notifications.empty")}</p>}
      <ul className="notif-list">
        {items.map((n) => {
          const href = linkFor(n);
          return (
            <li key={n.id} className={`notif ${n.read ? "" : "notif-unread"}`}>
              {href ? <Link href={href}>{text(n)}</Link> : <span>{text(n)}</span>}
              <time className="muted">{new Date(n.created_at).toLocaleString()}</time>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

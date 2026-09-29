"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { TrashItem } from "@/app/lib/actions/mvp2";
import { restoreNodeAction, restoreFolderAction, hardDeleteNodeAction, hardDeleteFolderAction, emptyTrashAction } from "@/app/lib/actions/mvp2";
import Crumbs from "../../_components/Crumbs";
import { toast } from "@/lib/store/toastStore";

/** Trash (Phase 10): restore / permanent-delete / empty. Deletes are
 *  cascade-only inside the RPCs — no multi-table delete here (Q7). */
export default function TrashView({ items }: { items: TrashItem[] }) {
  const t = useTranslations();
  const router = useRouter();

  const act = async (fn: () => Promise<unknown>, confirmMsg?: string) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    try { await fn(); router.refresh(); } catch (e) { toast.error(e instanceof Error ? e.message : t("common.error")); }
  };

  const cards = items.filter((i) => i.item_type === "node");
  const folders = items.filter((i) => i.item_type === "folder");

  return (
    <div className="trash-view">
      <Crumbs items={[{ href: "/feed", label: t("nav.home") }, { label: t("trash.title") }]} />
      <div className="feed-head">
        <h1 className="sec-title">{t("trash.title")} · {items.length}</h1>
        {items.length > 0 && (
          <button className="btn btn-danger" onClick={() => act(emptyTrashAction, t("trash.emptyConfirm"))}>
            {t("trash.emptyTrash")}
          </button>
        )}
      </div>
      {items.length === 0 && <p className="empty-note">{t("trash.empty")}</p>}

      {[
        { label: t("trash.folders"), rows: folders },
        { label: t("trash.cards"), rows: cards },
      ].map(({ label, rows }) => rows.length > 0 && (
        <section key={label}>
          <h2 className="sec-title">{label}</h2>
          <ul className="trash-list">
            {rows.map((i) => (
              <li key={i.id} className="trash-row">
                <span className="trash-title">{i.title ?? t("card.untitled")}</span>
                <span className="muted">{new Date(i.deleted_at).toLocaleDateString()}</span>
                <button
                  className="btn btn-sm"
                  onClick={() => act(i.item_type === "folder" ? () => restoreFolderAction(i.id) : () => restoreNodeAction(i.id))}
                >
                  {t("trash.restore")}
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => act(i.item_type === "folder" ? () => hardDeleteFolderAction(i.id) : () => hardDeleteNodeAction(i.id), t("trash.deleteConfirm"))}
                >
                  {t("trash.deleteForever")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

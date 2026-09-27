"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { OrganizeItemRow } from "@/app/lib/actions/mvp2";
import { applyOrganizeBatchAction, discardOrganizeBatchAction } from "@/app/lib/actions/mvp2";
import { toast } from "@/lib/store/toastStore";

const THUMB_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/`;

/** Batch review (Phase 7/Q16): accept-all or per-item selection, then
 *  apply — applying MOVES each item out of the source folder into the
 *  proposed target and applies proposed tags. */
export default function BatchView({ batchId, items }: { batchId: string; items: OrganizeItemRow[] }) {
  const t = useTranslations();
  const router = useRouter();
  const proposed = items.filter((i) => i.status === "proposed");
  const [sel, setSel] = useState<Set<string>>(new Set(proposed.map((i) => i.item_id)));
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    setBusy(true);
    try {
      await applyOrganizeBatchAction(batchId, [...sel]);
      toast.success(t("organize.applied"));
      router.push("/feed");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="org-view">
      <div className="feed-head">
        <h1 className="sec-title">{t("organize.proposals")}</h1>
        <div className="row">
          <button className="btn" onClick={() => setSel(new Set(proposed.map((i) => i.item_id)))}>{t("organize.acceptAll")}</button>
          <button className="btn" onClick={() => setSel(new Set())}>{t("common.none")}</button>
        </div>
      </div>

      <ul className="org-list">
        {items.map((i) => {
          const target = i.target_folder_name ?? i.new_folder_name;
          return (
            <li key={i.item_id} className="org-row">
              <input
                type="checkbox"
                checked={sel.has(i.item_id)}
                disabled={i.status !== "proposed"}
                onChange={() => {
                  const next = new Set(sel);
                  if (next.has(i.item_id)) next.delete(i.item_id); else next.add(i.item_id);
                  setSel(next);
                }}
              />
              {i.node_thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`${THUMB_BASE}${i.node_thumbnail}`} alt="" width={56} height={40} />
              ) : null}
              <Link href={`/card/${i.node_id}`} className="org-title">{i.node_title ?? t("card.untitled")}</Link>
              <span className="muted">
                {i.status === "proposed"
                  ? `${target ? t("organize.proposedFolder", { folder: target }) : ""}${i.new_folder_name ? ` (${t("organize.newFolder")})` : ""}`
                  : i.status}
              </span>
              {i.tag_labels?.length > 0 && (
                <span className="muted">{i.tag_labels.join(", ")}</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="modal-actions">
        <button className="btn btn-danger" onClick={async () => { await discardOrganizeBatchAction(batchId); router.push("/organize"); }} disabled={busy}>
          {t("organize.discard")}
        </button>
        <button className="btn btn-primary" onClick={apply} disabled={busy || sel.size === 0}>
          {t("organize.apply")} ({sel.size})
        </button>
      </div>
    </div>
  );
}

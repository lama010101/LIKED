"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Mvp2Folder, OrganizeBatchRow } from "@/app/lib/actions/mvp2";
import { discardOrganizeBatchAction } from "@/app/lib/actions/mvp2";
import { toast } from "@/lib/store/toastStore";

/** Organize home: run auto-organize on a folder + review past batches. */
export default function OrganizeHome({ batches, folders }: { batches: OrganizeBatchRow[]; folders: Mvp2Folder[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const runFor = async (folderId: string) => {
    setBusy(folderId);
    try {
      const res = await fetch("/api/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_folder_id: folderId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `categorize failed (${res.status})`);
      router.push(`/organize/${body.batch_id}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="org-view">
      <h1 className="sec-title">{t("organize.title")}</h1>

      <section>
        <h2 className="sec-title">{t("nav.folders")}</h2>
        <ul className="access-list">
          {folders.filter((f) => Number(f.node_count) > 0).map((f) => (
            <li key={f.id} className="access-row">
              <span className="access-name">{f.name}</span>
              <span className="muted">{f.node_count}</span>
              <button className="btn" disabled={busy === f.id} onClick={() => runFor(f.id)}>
                {busy === f.id ? t("common.loading") : t("organize.runFor", { folder: "" })}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="sec-title">{t("organize.proposals")}</h2>
        {batches.length === 0 && <p className="muted">{t("organize.nothingPending")}</p>}
        <ul className="access-list">
          {batches.map((b) => (
            <li key={b.id} className="access-row">
              <Link href={`/organize/${b.id}`} className="access-name">
                {b.source_folder_name} — {b.status} ({b.proposed_count}/{b.item_count})
              </Link>
              <span className="muted">{new Date(b.created_at).toLocaleDateString()}</span>
              {b.status === "open" && (
                <button className="btn btn-danger btn-sm" onClick={async () => { await discardOrganizeBatchAction(b.id); router.refresh(); }}>
                  {t("organize.discard")}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

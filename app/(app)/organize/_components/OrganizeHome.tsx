"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Mvp2Folder, OrganizeBatchRow } from "@/app/lib/actions/mvp2";
import {
  createOrganizeBatchAction,
  discardOrganizeBatchAction,
  getOrganizeBatchAction,
} from "@/app/lib/actions/mvp2";
import Crumbs from "../../_components/Crumbs";
import Modal from "../../_components/Modal";
import ProgressModal from "../../_components/ProgressModal";
import { toast } from "@/lib/store/toastStore";

/** Organize home: run auto-organize on a folder + review past batches.
 *  Run flow: create_organize_batch (snapshot) → POST /api/categorize with
 *  the batch id → poll get_organize_batch for per-item progress. Closing
 *  the progress dialog does NOT stop the run; Cancel discards the batch,
 *  which the route detects and stops on its next item. Finish → summary. */
export default function OrganizeHome({ batches, folders }: { batches: OrganizeBatchRow[]; folders: Mvp2Folder[] }) {
  const t = useTranslations();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [progOpen, setProgOpen] = useState(false);
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [job, setJob] = useState<{ batchId: string; folderName: string } | null>(null);
  const [summary, setSummary] = useState<{ batchId: string; created: number; candidates: number } | null>(null);
  const jobRef = useRef<{ batchId: string } | null>(null);

  const runFor = async (folderId: string, folderName: string) => {
    setBusy(folderId);
    let poll: ReturnType<typeof setInterval> | null = null;
    try {
      const batchId = await createOrganizeBatchAction(folderId);
      jobRef.current = { batchId };
      setJob({ batchId, folderName });
      setProg(null);
      setProgOpen(true);

      poll = setInterval(() => {
        getOrganizeBatchAction(batchId)
          .then((items) => setProg({
            done: items.filter((i) => i.status !== "pending").length,
            total: items.length,
          }))
          .catch(() => {});
      }, 1500);

      const res = await fetch("/api/categorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batch_id: batchId }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `categorize failed (${res.status})`);

      if (body.cancelled) {
        toast.success(t("organize.cancelledRun"));
      } else if (body.candidates === 0) {
        await discardOrganizeBatchAction(batchId).catch(() => {});
        toast.info(t("organize.nothingPending"));
      } else {
        setSummary({ batchId, created: body.created, candidates: body.candidates });
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      if (poll) clearInterval(poll);
      setBusy(null);
      setProgOpen(false);
      jobRef.current = null;
    }
  };

  const cancelJob = async () => {
    const j = jobRef.current;
    setProgOpen(false);
    if (j) await discardOrganizeBatchAction(j.batchId).catch(() => {});
  };

  return (
    <div className="org-view">
      <Crumbs items={[{ href: "/feed", label: t("nav.home") }, { label: t("organize.title") }]} />
      <h1 className="sec-title">{t("organize.title")}</h1>

      <section>
        <h2 className="sec-title">{t("nav.folders")}</h2>
        <ul className="access-list">
          {folders.filter((f) => Number(f.node_count) > 0).map((f) => (
            <li key={f.id} className="access-row">
              <span className="access-name">{f.name}</span>
              <span className="muted">{f.node_count}</span>
              <button className="btn" disabled={busy !== null} onClick={() => runFor(f.id, f.name)}>
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

      <ProgressModal
        open={progOpen && !!job}
        onClose={() => setProgOpen(false)}
        onCancel={cancelJob}
        title={t("organize.running", { folder: job?.folderName ?? "" })}
        text={prog ? t("organize.progress", { done: prog.done, total: prog.total }) : t("common.loading")}
        done={prog?.done}
        total={prog?.total}
      />

      {/* Post-run summary — also opens when the user had closed the progress dialog */}
      <Modal open={!!summary} onClose={() => setSummary(null)} title={t("organize.summaryTitle")}>
        {summary && (
          <>
            <p>{t("organize.summary", { candidates: summary.candidates, created: summary.created })}</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setSummary(null)}>{t("common.close")}</button>
              <button
                className="btn btn-primary"
                onClick={() => { const id = summary.batchId; setSummary(null); router.push(`/organize/${id}`); }}
              >
                {t("organize.review")}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

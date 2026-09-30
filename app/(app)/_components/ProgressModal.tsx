"use client";

import { useTranslations } from "next-intl";
import Modal from "./Modal";

/** Progress dialog for long-running jobs (YouTube import, auto-organize).
 *  Closing it (X / backdrop / Close) only hides the dialog — the job keeps
 *  running in page state. The danger button cancels the job itself. */
export default function ProgressModal({
  open, onClose, onCancel, title, text, done, total,
}: {
  open: boolean;
  onClose: () => void;
  onCancel: () => void;
  title: string;
  text: string;
  done?: number;
  total?: number;
}) {
  const t = useTranslations();
  const pct = done != null && total ? Math.min(100, Math.round((done / total) * 100)) : null;
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="row">
        <SpinnerIcon />
        <p className="muted" style={{ margin: 0 }}>{text}</p>
      </div>
      {pct !== null && (
        <div className="progress-bar"><div style={{ width: `${pct}%` }} /></div>
      )}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>{t("common.close")}</button>
        <button className="btn btn-danger" onClick={onCancel}>{t("job.stop")}</button>
      </div>
    </Modal>
  );
}

function SpinnerIcon() {
  return (
    <svg className="icon-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12a9 9 0 1 1-6.2-8.56" />
    </svg>
  );
}

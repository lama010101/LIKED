"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Modal from "./Modal";
import { getFoldersAction, type Mvp2Folder } from "@/app/lib/actions/mvp2";

/** Folder destination picker — lazy-loads the folder list when opened.
 *  hideSystem drops system folders (folder reparenting); card moves keep
 *  them (Unsorted is a valid move target). */
export default function FolderPickModal({
  open, onClose, onPick, title, excludeId = null, allowRoot = false, hideSystem = false,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (folderId: string | null) => void;
  title: string;
  excludeId?: string | null;
  allowRoot?: boolean;
  hideSystem?: boolean;
}) {
  const t = useTranslations();
  const [folders, setFolders] = useState<Mvp2Folder[] | null>(null);
  const [sel, setSel] = useState("");
  const [prevOpen, setPrevOpen] = useState(open);

  // Reset when the dialog opens (state-adjustment-during-render pattern).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setFolders(null); setSel(""); }
  }

  useEffect(() => {
    if (!open) return;
    let live = true;
    getFoldersAction()
      .then((f) => { if (live) setFolders(f); })
      .catch(() => { if (live) setFolders([]); });
    return () => { live = false; };
  }, [open]);

  const list = (folders ?? []).filter(
    (f) => f.id !== excludeId && (!hideSystem || !f.system_kind)
  );

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {folders === null ? (
        <p className="muted">{t("common.loading")}</p>
      ) : (
        <label className="fld">
          <span>{t("add.folderPicker")}</span>
          <select value={sel} onChange={(e) => setSel(e.target.value)}>
            {allowRoot && <option value="">{t("add.rootFolder")}</option>}
            {!allowRoot && list.length === 0 && <option value="">{t("add.noFolder")}</option>}
            {list.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>
      )}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
        <button
          className="btn btn-primary"
          disabled={!allowRoot && !sel}
          onClick={() => { onPick(sel || null); onClose(); }}
        >
          {t("common.confirm")}
        </button>
      </div>
    </Modal>
  );
}

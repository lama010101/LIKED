"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Modal from "./Modal";
import { createFolderAction, getFoldersAction, type Mvp2Folder } from "@/app/lib/actions/mvp2";
import { toast } from "@/lib/store/toastStore";

const NEW_FOLDER = "__new__";

/** Folder destination picker — lazy-loads the folder list when opened.
 *  hideSystem drops system folders (folder reparenting); card moves keep
 *  them (Unsorted is a valid move target). "New folder" creates a root
 *  folder in-place and picks it as the destination. */
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
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [prevOpen, setPrevOpen] = useState(open);

  // Reset when the dialog opens (state-adjustment-during-render pattern).
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setFolders(null); setSel(""); setNewName(""); setBusy(false); }
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

  const creating = sel === NEW_FOLDER;
  const confirmDisabled = busy || (creating ? !newName.trim() : (!allowRoot && !sel));

  const confirm = async () => {
    if (!creating) { onPick(sel || null); onClose(); return; }
    setBusy(true);
    try {
      const id = await createFolderAction({ name: newName.trim() });
      onPick(id);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {folders === null ? (
        <p className="muted">{t("common.loading")}</p>
      ) : (
        <>
          <label className="fld">
            <span>{t("add.folderPicker")}</span>
            <select value={sel} onChange={(e) => setSel(e.target.value)}>
              {allowRoot && <option value="">{t("add.rootFolder")}</option>}
              {!allowRoot && list.length === 0 && <option value="">{t("add.noFolder")}</option>}
              {list.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
              <option value={NEW_FOLDER}>+ {t("folder.new")}</option>
            </select>
          </label>
          {creating && (
            <label className="fld">
              <span>{t("common.name")}</span>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("folder.namePlaceholder")}
                onKeyDown={(e) => { if (e.key === "Enter" && !confirmDisabled) confirm(); }}
              />
            </label>
          )}
        </>
      )}
      <div className="modal-actions">
        <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
        <button
          className="btn btn-primary"
          disabled={confirmDisabled}
          onClick={confirm}
        >
          {t("common.confirm")}
        </button>
      </div>
    </Modal>
  );
}

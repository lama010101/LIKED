"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Modal from "./Modal";
import { toast } from "@/lib/store/toastStore";
import { createCardAction, createFolderAction, type Mvp2Folder } from "@/app/lib/actions/mvp2";

/**
 * FAB / Add-sheet: create a card (link or note, optional target folder)
 * or a folder (optional parent = current context). All writes via RPCs.
 */
export default function AddSheet({
  open, onClose, folders, contextFolderId = null, initialMode = "card", onCreated,
}: {
  open: boolean;
  onClose: () => void;
  folders: Mvp2Folder[];
  contextFolderId?: string | null;
  initialMode?: "card" | "folder";
  onCreated?: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [mode, setMode] = useState<"card" | "folder">(initialMode);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [folderName, setFolderName] = useState("");
  const [folderDesc, setFolderDesc] = useState("");
  const [parentId, setParentId] = useState<string>(contextFolderId ?? "");

  // Re-sync parent + mode each time the sheet opens (context may change).
  useEffect(() => {
    if (open) { setParentId(contextFolderId ?? ""); setMode(initialMode); }
  }, [open, contextFolderId, initialMode]);

  const reset = () => { setUrl(""); setTitle(""); setNote(""); setFolderId(""); setFolderName(""); setFolderDesc(""); };

  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "card") {
        const res = await createCardAction({
          url: url.trim() || null,
          text: note.trim() || null,
          title: title.trim() || null,
          folderId: folderId || contextFolderId,
        });
        if (!res.ok) { toast.error(res.error ?? t("common.error")); return; }
      } else {
        if (!folderName.trim()) { toast.error(t("folder.namePlaceholder")); return; }
        const newFolderId = await createFolderAction({ name: folderName.trim(), parentId: parentId || null, description: folderDesc.trim() || null });
        reset();
        onClose();
        onCreated?.();
        if (newFolderId) router.push(`/folders/${newFolderId}`);
        return;
      }
      reset();
      onClose();
      onCreated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("add.title")}>
      <div className="seg">
        <button className={`seg-btn ${mode === "card" ? "seg-on" : ""}`} onClick={() => setMode("card")}>{t("add.card")}</button>
        <button className={`seg-btn ${mode === "folder" ? "seg-on" : ""}`} onClick={() => setMode("folder")}>{t("add.folder")}</button>
      </div>

      {mode === "card" ? (
        <div className="form">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={t("add.urlPlaceholder")} inputMode="url" />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("add.titlePlaceholder")} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("add.notePlaceholder")} rows={3} />
          <label className="fld">
            <span>{t("add.folderPicker")}</span>
            <select value={folderId || (contextFolderId ?? "")} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">{t("add.noFolder")}</option>
              {folders.filter((f) => f.system_kind !== "unsorted").map((f) => (
                <option key={f.id} value={f.id}>{f.owner_id ? "" : ""}{f.name}</option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="form">
          <input value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder={t("folder.namePlaceholder")} />
          <input value={folderDesc} onChange={(e) => setFolderDesc(e.target.value)} placeholder={t("folder.descriptionPlaceholder")} />
          <label className="fld">
            <span>{t("add.parentFolder")}</span>
            <select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">{t("add.rootFolder")}</option>
              {folders.filter((f) => !f.system_kind).map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
          <p className="muted add-parent-hint">
            {t("add.insideHint", { folder: parentId ? folders.find((f) => f.id === parentId)?.name ?? "…" : t("add.rootFolder") })}
          </p>
        </div>
      )}

      <div className="modal-actions">
        <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
        <button className="btn btn-primary" onClick={submit} disabled={busy}>
          {mode === "card" ? t("add.create") : t("add.createFolder")}
        </button>
      </div>
    </Modal>
  );
}

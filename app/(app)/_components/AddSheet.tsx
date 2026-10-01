"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Modal from "./Modal";
import { toast } from "@/lib/store/toastStore";
import { createCardAction, createFolderAction, type Mvp2Folder } from "@/app/lib/actions/mvp2";
import { importYouTubeActivity } from "@/app/lib/actions/youtubeImport";

interface YtVideo {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  channelId: string;
  description: string;
  categoryId: string;
}

/**
 * FAB / Add-sheet: create a card (link or note, optional target folder),
 * search YouTube and save results as cards (§41.3.2), or create a folder
 * (optional parent = current context). All writes via RPCs.
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
  const [mode, setMode] = useState<"card" | "folder" | "youtube">(initialMode);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [folderId, setFolderId] = useState<string>("");
  const [folderName, setFolderName] = useState("");
  const [folderDesc, setFolderDesc] = useState("");
  const [parentId, setParentId] = useState<string>(contextFolderId ?? "");
  const [ytQuery, setYtQuery] = useState("");
  const [ytResults, setYtResults] = useState<YtVideo[]>([]);
  const [ytSearching, setYtSearching] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [ytNotConnected, setYtNotConnected] = useState(false);
  const [ytSavingId, setYtSavingId] = useState<string | null>(null);
  const [ytPreviewingId, setYtPreviewingId] = useState<string | null>(null);
  const [ytAdded, setYtAdded] = useState<Set<string>>(new Set());

  // Re-sync parent + mode each time the sheet opens (context may change).
  useEffect(() => {
    if (open) {
      setParentId(contextFolderId ?? ""); setMode(initialMode);
      setYtQuery(""); setYtResults([]); setYtSearching(false); setYtError(null);
      setYtNotConnected(false); setYtSavingId(null); setYtPreviewingId(null);
      setYtAdded(new Set());
    }
  }, [open, contextFolderId, initialMode]);

  // YouTube mode: debounced search against /api/youtube/search (min 2 chars).
  useEffect(() => {
    if (mode !== "youtube") return;
    const q = ytQuery.trim();
    if (q.length < 2) {
      queueMicrotask(() => {
        setYtResults([]); setYtError(null); setYtSearching(false);
      });
      return;
    }
    const timer = setTimeout(async () => {
      setYtSearching(true);
      setYtError(null);
      setYtNotConnected(false);
      try {
        const res = await fetch(`/api/youtube/search?q=${encodeURIComponent(q)}`);
        const data = await res.json().catch(() => null);
        if (res.status === 401 && data?.code === "not_connected") {
          setYtNotConnected(true); setYtResults([]);
        } else if (!res.ok) {
          setYtError(data?.error ?? t("add.ytFailed")); setYtResults([]);
        } else {
          setYtResults(Array.isArray(data?.videos) ? data.videos : []);
        }
      } catch {
        setYtError(t("add.ytNetworkError")); setYtResults([]);
      } finally {
        setYtSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [ytQuery, mode, t]);

  const reset = () => { setUrl(""); setTitle(""); setNote(""); setFolderId(""); setFolderName(""); setFolderDesc(""); };

  // N12: explicit picker wins, then current folder context, then the
  // RPC-side "YouTube" auto-folder fallback. Sheet stays open so several
  // results can be added in one session.
  const pickVideo = async (v: YtVideo) => {
    if (ytSavingId) return;
    setYtSavingId(v.id);
    setYtError(null);
    try {
      const targetFolderId = folderId || contextFolderId;
      const result = await importYouTubeActivity({
        url: `https://www.youtube.com/watch?v=${v.id}`,
        title: v.title,
        description: v.description,
        channelTitle: v.channelTitle,
        categoryId: v.categoryId,
        thumbnailUrl: v.thumbnail || null,
        targetFolderId,
      });
      if (result.ok) {
        toast.success(targetFolderId ? t("add.ytSaved") : t("add.ytSavedYouTube"));
        setYtAdded((prev) => new Set(prev).add(v.id));
        onCreated?.();
      } else if (result.code === "duplicate") {
        toast.success(t("add.ytDuplicate"));
        setYtAdded((prev) => new Set(prev).add(v.id));
      } else {
        setYtError(result.error || t("add.ytFailed"));
      }
    } catch {
      setYtError(t("add.ytFailed"));
    } finally {
      setYtSavingId(null);
    }
  };

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
        <button className={`seg-btn ${mode === "youtube" ? "seg-on" : ""}`} onClick={() => setMode("youtube")}>{t("add.youtube")}</button>
        <button className={`seg-btn ${mode === "folder" ? "seg-on" : ""}`} onClick={() => setMode("folder")}>{t("add.folder")}</button>
      </div>

      {mode === "youtube" ? (
        <div className="form">
          <input value={ytQuery} onChange={(e) => setYtQuery(e.target.value)} placeholder={t("add.ytPlaceholder")} inputMode="search" />
          <label className="fld">
            <span>{t("add.folderPicker")}</span>
            <select value={folderId || (contextFolderId ?? "")} onChange={(e) => setFolderId(e.target.value)}>
              <option value="">{t("add.noFolder")}</option>
              {folders.filter((f) => f.system_kind !== "unsorted").map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </label>
          <div className="yt-results">
            {ytNotConnected ? (
              <div className="yt-connect">
                <p>{t("add.ytNotConnected")}</p>
                <button type="button" className="btn btn-primary" onClick={() => window.location.assign("/api/youtube/connect")}>
                  {t("add.ytConnect")}
                </button>
              </div>
            ) : ytSearching ? (
              <p className="yt-empty">{t("add.ytSearching")}</p>
            ) : ytError ? (
              <p className="yt-error" role="alert">{ytError}</p>
            ) : ytResults.length > 0 ? (
              ytResults.map((v) => (
                <div key={v.id} className="yt-item">
                  <div className="yt-row" style={{ opacity: ytSavingId && ytSavingId !== v.id ? 0.5 : 1 }}>
                    <button
                      type="button"
                      className="yt-main"
                      onClick={() => setYtPreviewingId((p) => (p === v.id ? null : v.id))}
                      disabled={!!ytSavingId}
                      aria-expanded={ytPreviewingId === v.id}
                    >
                      {v.thumbnail && (
                        <Image src={v.thumbnail} alt="" width={72} height={40} unoptimized className="yt-thumb" />
                      )}
                      <span className="yt-text">
                        <span className="yt-title">{v.title}</span>
                        <span className="yt-channel">{v.channelTitle}</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary yt-add"
                      onClick={() => pickVideo(v)}
                      disabled={!!ytSavingId || ytAdded.has(v.id)}
                    >
                      {ytAdded.has(v.id) ? t("add.ytAdded") : ytSavingId === v.id ? t("add.ytSaving") : t("add.ytAdd")}
                    </button>
                  </div>
                  {ytPreviewingId === v.id && (
                    <div className="yt-preview" ref={(el) => el?.scrollIntoView({ block: "nearest", behavior: "smooth" })}>
                      <iframe
                        src={`https://www.youtube.com/embed/${v.id}`}
                        title={v.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  )}
                </div>
              ))
            ) : ytQuery.trim().length >= 2 ? (
              <p className="yt-empty">{t("add.ytNoResults")}</p>
            ) : (
              <p className="yt-empty">{t("add.ytTypeToSearch")}</p>
            )}
          </div>
        </div>
      ) : mode === "card" ? (
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
        {mode !== "youtube" && (
          <button className="btn btn-primary" onClick={submit} disabled={busy}>
            {mode === "card" ? t("add.create") : t("add.createFolder")}
          </button>
        )}
      </div>
    </Modal>
  );
}

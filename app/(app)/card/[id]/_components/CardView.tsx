"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { CardDetail } from "@/lib/db/cardDetail";
import { rateCardAction, trashCardAction, updateNodeTitleAction, updateNodeTextAction } from "@/app/lib/actions/cardDetail";
import { shareNodeAction, getNodeAccessAction, changeNodePermissionAction, unshareNodeAction, type AccessEntry } from "@/app/lib/actions/mvp2";
import { getFriendBarAction, getGroupBarAction } from "@/app/lib/actions/session";
import { toast } from "@/lib/store/toastStore";
import { youtubeVideoId, youtubeEmbedUrl } from "@/lib/utils/youtube";
import RatingSlider from "../../../_components/RatingSlider";
import ShareSheet from "../../../_components/ShareSheet";
import Avatar from "../../../_components/Avatar";
import Crumbs from "../../../_components/Crumbs";

const THUMB_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/`;

/** Card detail (Phase 5): media, title (owner-edit), rating 0-100,
 *  owner-only access list (Q20), share, trash. */
export default function CardView({ detail }: { detail: CardDetail }) {
  const t = useTranslations();
  const router = useRouter();
  const { node, isOwner } = detail;
  const [title, setTitle] = useState(node.title ?? "");
  const [editing, setEditing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // window.origin is unavailable during SSR — resolved when the user
  // opens the sheet (click always runs client-side).
  const [shareUrl, setShareUrl] = useState(`/card/${node.id}`);
  // Click-to-edit note body (UX-BATCH-002): Undo restores the saved text,
  // Cancel discards, Save persists; back arrow auto-saves.
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(node.text_content ?? "");
  const [noteSaving, setNoteSaving] = useState(false);
  const noteDirty = noteDraft !== (node.text_content ?? "");

  // A note whose title is unset or just echoes its content shows the body
  // once — crumb and heading fall back to "untitled" instead of duplicating.
  // Auto-derived titles (creation copies first ~120 chars of the body) count
  // as echoes in either direction so truncated bodies don't leak into the
  // crumb/heading (UX-BATCH-002).
  const text0 = node.text_content ?? "";
  const isAutoTitle = !!node.title && !!text0 && (text0.startsWith(node.title) || node.title.startsWith(text0));
  const hasDistinctTitle = !!node.title && !isAutoTitle;

  const saveTitle = async () => {
    const res = await updateNodeTitleAction(node.id, title.trim());
    if (res.ok) { setEditing(false); router.refresh(); } else { toast.error(res.error); }
  };

  const saveNote = async () => {
    setNoteSaving(true);
    const res = await updateNodeTextAction(node.id, noteDraft.trim());
    // Auto-derived title follows the body it echoes (else the stale old
    // body surfaces as crumb/heading after the first edit).
    if (res.ok && isAutoTitle) {
      await updateNodeTitleAction(node.id, noteDraft.trim().slice(0, 120));
    }
    setNoteSaving(false);
    if (res.ok) { setNoteEditing(false); router.refresh(); } else { toast.error(res.error); }
    return res.ok;
  };

  const onTrash = async () => {
    if (!confirm(t("trash.deleteConfirm"))) return;
    const res = await trashCardAction(node.id);
    if (res.ok) { router.push("/feed"); router.refresh(); } else toast.error(res.error);
  };

  const onBack = async () => {
    // Auto-save an in-progress note edit before leaving (UX-BATCH-002).
    if (noteEditing && noteDirty && !(await saveNote())) return;
    if (window.history.length > 1) router.back();
    else router.push("/feed");
  };

  return (
    <div className="card-view">
      <div className="crumbs crumbs-row">
        <button className="crumbs-back" onClick={onBack}>← {t("nav.back")}</button>
        <Crumbs items={[{ href: "/feed", label: t("nav.home") }, { label: hasDistinctTitle ? node.title! : t("card.untitled") }]} />
      </div>

      {/* YouTube cards embed the player inside the card (UX-BATCH-003);
          the embed REPLACES the hero image (they must not render together). */}
      {(() => { const ytId = youtubeVideoId(node.url); return ytId ? (
        <div className="cv-yt">
          <iframe
            src={youtubeEmbedUrl(ytId, false)}
            title={node.title ?? "YouTube"}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : null; })()}
      {!youtubeVideoId(node.url) && node.thumbnail_key && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cv-hero" src={`${THUMB_BASE}${node.thumbnail_key}`} alt="" />
      )}

      {hasDistinctTitle && (editing ? (
        <div className="cv-title-edit">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn btn-primary" onClick={saveTitle}>{t("common.save")}</button>
        </div>
      ) : (
        <h1 className="cv-title" onDoubleClick={() => isOwner && setEditing(true)}>
          {node.title}
        </h1>
      ))}
      {isOwner && !noteEditing && <button className="btn btn-sm" onClick={() => setEditing(true)}>{t("folder.rename")}</button>}

      {node.url && (
        <a className="cv-url" href={node.url} target="_blank" rel="noopener noreferrer">
          {node.url}
        </a>
      )}
      {node.text_content != null && (noteEditing ? (
        <div className="cv-note-edit">
          <textarea
            className="cv-note-textarea"
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            rows={Math.min(20, Math.max(4, noteDraft.split("\n").length + 1))}
            autoFocus
          />
          <div className="cv-note-actions">
            <button className="btn btn-sm" onClick={() => setNoteDraft(node.text_content ?? "")} disabled={!noteDirty}>{t("common.undo")}</button>
            <button className="btn btn-sm" onClick={() => { setNoteDraft(node.text_content ?? ""); setNoteEditing(false); }}>{t("common.cancel")}</button>
            <button className="btn btn-sm btn-primary" onClick={saveNote} disabled={noteSaving}>{t("common.save")}</button>
          </div>
        </div>
      ) : (
        <p
          className={`cv-text ${isOwner ? "cv-text-editable" : ""}`}
          onClick={() => { if (isOwner) { setNoteDraft(node.text_content ?? ""); setNoteEditing(true); } }}
          title={isOwner ? t("card.editNote") : undefined}
        >{node.text_content}</p>
      ))}

      {detail.tags.length > 0 && (
        <div className="cv-tags">
          {detail.tags.map((tag) => (
            <a key={tag.id} className="tag-pill tag-link" style={{ borderColor: tag.color_hex }} href={`/feed?tag=${tag.id}`}>{tag.label}</a>
          ))}
        </div>
      )}

      <RatingSlider
        initial={detail.yourRating}
        onRate={async (s) => { const r = await rateCardAction(node.id, s); if (!r.ok) toast.error(r.error); }}
        label={t("card.yourRating")}
      />

      {detail.ratings.length > 0 && (
        <p className="muted">★ {detail.sortCache.avgRating != null ? Math.round(detail.sortCache.avgRating) : "—"} · {detail.ratings.length}</p>
      )}

      <div className="folder-actions">
        <button className="btn" onClick={() => { setShareUrl(`${window.location.origin}/card/${node.id}`); setShareOpen(true); }}>{t("common.share")}</button>
        {isOwner && <button className="btn btn-danger" onClick={onTrash}>{t("card.deleteCard")}</button>}
      </div>

      {/* Owner-only recipient list (Q20) with permission control */}
      {isOwner && (
        <section>
          <h2 className="sec-title">{t("card.sharedWith")}</h2>
          <CardAccessList nodeId={node.id} />
        </section>
      )}

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        shareUrl={shareUrl}
        loadTargets={async () => {
          const [fr, gr] = await Promise.all([getFriendBarAction(), getGroupBarAction()]);
          return {
            friends: fr.filter((f) => f.user_id).map((f) => ({ id: f.user_id!, name: f.display_name ?? "", avatarKey: f.avatar_key })),
            groups: gr.map((g) => ({ id: g.id, name: g.name })),
          };
        }}
        onShare={async ({ permission, userIds, groupIds, allFriends }) => {
          await shareNodeAction(node.id, permission, userIds, groupIds, allFriends);
          toast.success(t("share.sharedOk"));
          router.refresh();
        }}
      />
    </div>
  );
}

/** Owner-only access list (Q20): get_node_access rows + per-cause
 *  permission change (change_node_permission) and revoke (unshare). */
function CardAccessList({ nodeId }: { nodeId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [rows, setRows] = useState<AccessEntry[] | null>(null);

  useEffect(() => {
    getNodeAccessAction(nodeId).then(setRows).catch(() => setRows([]));
  }, [nodeId]);

  if (rows === null) return <p className="muted">{t("common.loading")}</p>;
  if (rows.length === 0) return <p className="muted">{t("share.ownerOnly")}</p>;

  return (
    <ul className="access-list">
      {rows.map((a) => (
        <li key={a.cause_id ?? a.user_id} className="access-row">
          <Avatar userId={a.user_id ?? ""} avatarKey={a.avatar_key} name={a.display_name} size={28} />
          <span className="access-name">{a.display_name}</span>
          <select
            value={a.permission}
            onChange={async (e) => {
              if (!a.cause_id) return;
              try { await changeNodePermissionAction(a.cause_id, e.target.value); router.refresh(); }
              catch (err) { toast.error(err instanceof Error ? err.message : t("common.error")); }
            }}
          >
            {["view", "comment", "edit", "reshare"].map((p) => (
              <option key={p} value={p}>{t(`folder.permission${p[0].toUpperCase()}${p.slice(1)}` as "folder.permissionView")}</option>
            ))}
          </select>
          <button
            className="btn btn-danger btn-sm"
            onClick={async () => {
              if (!a.cause_id) return;
              try { await unshareNodeAction(a.cause_id); setRows(rows.filter((r) => r !== a)); }
              catch (err) { toast.error(err instanceof Error ? err.message : t("common.error")); }
            }}
          >
            {t("share.revoke")}
          </button>
        </li>
      ))}
    </ul>
  );
}

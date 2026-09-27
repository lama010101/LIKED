"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import type { CardDetail } from "@/lib/db/cardDetail";
import { rateCardAction, trashCardAction, updateNodeTitleAction } from "@/app/lib/actions/cardDetail";
import { shareNodeAction, getNodeAccessAction, changeNodePermissionAction, unshareNodeAction, type AccessEntry } from "@/app/lib/actions/mvp2";
import { getFriendBarAction, getGroupBarAction } from "@/app/lib/actions/session";
import { toast } from "@/lib/store/toastStore";
import RatingSlider from "../../../_components/RatingSlider";
import ShareSheet from "../../../_components/ShareSheet";
import Avatar from "../../../_components/Avatar";

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

  const saveTitle = async () => {
    const res = await updateNodeTitleAction(node.id, title.trim());
    res.ok ? (setEditing(false), router.refresh()) : toast.error(res.error);
  };

  const onTrash = async () => {
    if (!confirm(t("trash.deleteConfirm"))) return;
    const res = await trashCardAction(node.id);
    if (res.ok) { router.push("/feed"); router.refresh(); } else toast.error(res.error);
  };

  return (
    <div className="card-view">
      {node.thumbnail_key && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cv-hero" src={`${THUMB_BASE}${node.thumbnail_key}`} alt="" />
      )}

      {editing ? (
        <div className="cv-title-edit">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn btn-primary" onClick={saveTitle}>{t("common.save")}</button>
        </div>
      ) : (
        <h1 className="cv-title" onDoubleClick={() => isOwner && setEditing(true)}>
          {node.title ?? t("card.untitled")}
        </h1>
      )}
      {isOwner && <button className="btn btn-sm" onClick={() => setEditing(true)}>{t("folder.rename")}</button>}

      {node.url && (
        <a className="cv-url" href={node.url} target="_blank" rel="noopener noreferrer">
          {node.url}
        </a>
      )}
      {node.text_content && <p className="cv-text">{node.text_content}</p>}

      {detail.tags.length > 0 && (
        <div className="cv-tags">
          {detail.tags.map((tag) => (
            <span key={tag.id} className="tag-pill" style={{ borderColor: tag.color_hex }}>{tag.label}</span>
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
        <button className="btn" onClick={() => setShareOpen(true)}>{t("common.share")}</button>
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

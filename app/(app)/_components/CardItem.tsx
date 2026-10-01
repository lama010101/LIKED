"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { FeedNode } from "@/lib/types/feed";
import {
  moveNodeEverywhereAction, shareNodeAction, trashNodeAction,
} from "@/app/lib/actions/mvp2";
import { getFriendBarAction, getGroupBarAction } from "@/app/lib/actions/session";
import { toast } from "@/lib/store/toastStore";
import { youtubeVideoId, youtubeEmbedUrl } from "@/lib/utils/youtube";
import Avatar from "./Avatar";
import ItemMenu from "./ItemMenu";
import FolderPickModal from "./FolderPickModal";
import ShareSheet from "./ShareSheet";

const THUMB_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/`;

/** One feed card — pure render of get_feed output. Draggable for folder moves.
 *  ⋯ menu: move / share / trash. Menu modals portal to <body> because the
 *  card is wrapped in a <Link> and clips overflow. */
export default function CardItem({ node }: { node: FeedNode }) {
  const t = useTranslations();
  const router = useRouter();
  const isOwn = node.direction !== "received";
  const [moveOpen, setMoveOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  // YouTube cards play inline from the thumbnail (UX-BATCH-003).
  const [playing, setPlaying] = useState(false);
  const ytId = youtubeVideoId(node.url);

  const onTrash = async () => {
    if (!confirm(t("trash.deleteConfirm"))) return;
    try {
      await trashNodeAction(node.node_id);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  const onMove = async (folderId: string | null) => {
    if (!folderId) return;
    try {
      await moveNodeEverywhereAction(node.node_id, folderId);
      toast.success(t("common.done"));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  };

  return (
    <article
      className="card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-liked-node", node.node_id);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      {ytId && playing ? (
        <iframe
          className="card-thumb card-yt"
          src={youtubeEmbedUrl(ytId)}
          title={node.title ?? "YouTube"}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
        />
      ) : ytId && node.thumbnail_key ? (
        <button
          type="button"
          className="card-thumb card-yt-btn"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPlaying(true); }}
          aria-label={t("card.play")}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${THUMB_BASE}${node.thumbnail_key}`} alt="" loading="lazy" />
          <span className="card-yt-play" aria-hidden="true">▶</span>
        </button>
      ) : node.thumbnail_key ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="card-thumb" src={`${THUMB_BASE}${node.thumbnail_key}`} alt="" loading="lazy" />
      ) : (
        <div className="card-thumb card-thumb-text">
          {(node.title ?? node.text_content ?? t("card.untitled")).slice(0, 1).toUpperCase()}
        </div>
      )}
      <div className="card-body">
        <h3 className="card-title">{node.title ?? node.text_content?.slice(0, 80) ?? t("card.untitled")}</h3>
        {node.url && <p className="card-url">{new URL(node.url).hostname}</p>}
        <div className="card-meta">
          {node.direction === "received" && node.sender_name && (
            <span className="card-sender">
              <Avatar userId={node.sender_id ?? ""} avatarKey={node.sender_avatar_key} name={node.sender_name} size={16} />
              {node.sender_name}
            </span>
          )}
          {node.avg_rating != null && <span className="card-rating">★ {Math.round(node.avg_rating)}</span>}
          {node.tags?.slice(0, 3).map((tag) => (
            <span
              key={tag.tag_id}
              className="tag-pill tag-link"
              style={{ borderColor: tag.color_hex }}
              role="link"
              tabIndex={0}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(`/feed?tag=${tag.tag_id}`); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); router.push(`/feed?tag=${tag.tag_id}`); } }}
            >
              {tag.label}
            </span>
          ))}
        </div>
      </div>
      <ItemMenu
        title={node.title ?? node.text_content?.slice(0, 60) ?? t("card.untitled")}
        actions={[
          ...(isOwn ? [{ key: "move", label: t("card.moveToFolder"), onSelect: () => setMoveOpen(true) }] : []),
          { key: "share", label: t("common.share"), onSelect: () => setShareOpen(true) },
          ...(isOwn ? [{ key: "trash", label: t("card.deleteCard"), danger: true, onSelect: onTrash }] : []),
        ]}
      />
      {(moveOpen || shareOpen) && typeof document !== "undefined" && createPortal(
        <>
          <FolderPickModal
            open={moveOpen}
            onClose={() => setMoveOpen(false)}
            title={t("card.moveToFolder")}
            onPick={onMove}
          />
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
              await shareNodeAction(node.node_id, permission, userIds, groupIds, allFriends);
            }}
          />
        </>,
        document.body
      )}
    </article>
  );
}

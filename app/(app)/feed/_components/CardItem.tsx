"use client";

import { useTranslations } from "next-intl";
import type { FeedNode } from "@/lib/types/feed";
import Avatar from "../../_components/Avatar";

const THUMB_BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/`;

/** One feed card — pure render of get_feed output. Draggable for folder moves. */
export default function CardItem({ node }: { node: FeedNode }) {
  const t = useTranslations();
  return (
    <article
      className="card"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-liked-node", node.node_id);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      {node.thumbnail_key ? (
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
            <span key={tag.tag_id} className="tag-pill" style={{ borderColor: tag.color_hex }}>
              {tag.label}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

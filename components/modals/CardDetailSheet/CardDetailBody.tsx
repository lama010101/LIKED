/**
 * Body component — extracted from CardDetailSheet
 * Composes the media, title, meta pills, rating, tags, friend ratings,
 * shared-with, and action buttons sections.
 */

import type { CardDetail } from "@/lib/db/cardDetail";
import { detectEmbed } from "./detectEmbed";
import { CardDetailMedia } from "./CardDetailMedia";
import { CardDetailFriendRatings, type FriendRating } from "./CardDetailFriendRatings";
import { CardDetailTags } from "./CardDetailTags";
import { Pill, actionBtn } from "./CardDetailPrimitives";

interface BodyProps {
  detail: CardDetail;
  embed: ReturnType<typeof detectEmbed>;
  mediaRef: React.RefObject<HTMLDivElement | null>;
  onFullscreen: () => void;
  ratingValue: number;
  setRatingValue: (v: number) => void;
  onRatingCommit: (v: number) => void;
  editingTitle: boolean;
  setEditingTitle: (b: boolean) => void;
  titleDraft: string;
  setTitleDraft: (v: string) => void;
  onTitleSave: () => void;
  onTrash: () => void;
  onShareClick?: (nodeId: string) => void;
  currentUserId: string;
  onRemoveTag: (tagId: string) => void;
  onOpenTagPicker: () => void;
  onAddTag: (tagId: string) => void;
  tagPickerOpen: boolean;
  setTagPickerOpen: (b: boolean) => void;
  availableTags: Array<{ id: string; label: string; color_hex: string }>;
  friendRatings: FriendRating[];
  friendRatingsLoading: boolean;
}

export function Body({
  detail,
  embed,
  mediaRef,
  onFullscreen,
  ratingValue,
  setRatingValue,
  onRatingCommit,
  editingTitle,
  setEditingTitle,
  titleDraft,
  setTitleDraft,
  onTitleSave,
  onTrash,
  onShareClick,
  currentUserId,
  onRemoveTag,
  onOpenTagPicker,
  onAddTag,
  tagPickerOpen,
  setTagPickerOpen,
  availableTags,
  friendRatings,
  friendRatingsLoading,
}: BodyProps) {
  const { node, tags, sortCache, sharedWith, isOwner, yourRating } = detail;
  const isTextCard = !node.url && !!node.text_content;
  const direction =
    node.origin_user_id === currentUserId ? "mine" : "received";
  const canEdit = isOwner;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Media */}
      {!isTextCard && (
        <CardDetailMedia
          embed={embed}
          node={node}
          thumbnailKey={detail?.node.thumbnail_key ?? null}
          mediaRef={mediaRef}
          onFullscreen={onFullscreen}
        />
      )}

      {/* Title */}
      <div>
        {editingTitle && isOwner ? (
          <input
            type="text"
            value={titleDraft}
            autoFocus
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={onTitleSave}
            onKeyDown={(e) => {
              if (e.key === "Enter") onTitleSave();
              else if (e.key === "Escape") {
                setTitleDraft(node.title ?? "");
                setEditingTitle(false);
              }
            }}
            style={{
              width: "100%",
              padding: "8px 10px",
              fontSize: 16,
              fontWeight: 700,
              color: "var(--text-1)",
              background: "var(--surface-3)",
              border: "1px solid var(--border-1)",
              borderRadius: 8,
              outline: "none",
            }}
          />
        ) : (
          <h2
            onClick={() => isOwner && setEditingTitle(true)}
            style={{
              fontSize: 16,
              fontWeight: 700,
              lineHeight: 1.35,
              color: "var(--text-1)",
              margin: 0,
              cursor: isOwner ? "text" : "default",
            }}
            title={isOwner ? "Click to edit" : undefined}
          >
            {node.title ?? (isTextCard ? "Text note" : "Untitled")}
          </h2>
        )}

        {isTextCard && node.text_content && (
          <p
            style={{
              marginTop: 8,
              fontSize: 13,
              color: "var(--text-2)",
              whiteSpace: "pre-wrap",
            }}
          >
            {node.text_content}
          </p>
        )}
      </div>

      {/* Open externally CTA */}
      {node.url && (
        <a
          href={node.url}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: "12px",
            borderRadius: 12,
            background: "var(--color-received, #4a9fd5)",
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17L17 7" />
            <path d="M7 7h10v10" />
          </svg>
          Open in {embed.platform ?? "browser"}
        </a>
      )}

      {/* Meta pills */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        <Pill
          icon="★"
          label={
            sortCache.avgRating !== null
              ? sortCache.avgRating.toFixed(1)
              : "—"
          }
          hint="Avg rating"
        />
        <Pill icon="👁" label={sortCache.viewCount.toString()} hint="Views" />
        <Pill icon="↗" label={sortCache.shareCount.toString()} hint="Shares" />
        <Pill
          icon={direction === "mine" ? "↑" : "↓"}
          label={direction === "mine" ? "Mine" : "Received"}
          hint="Direction"
        />
      </div>

      {/* Rating slider */}
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            marginBottom: 6,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--text-2)", fontWeight: 600 }}>
            Your rating
          </span>
          <span style={{ fontSize: 13, color: "var(--text-1)", fontWeight: 700 }}>
            {yourRating === null && ratingValue === 0
              ? "—"
              : ratingValue.toFixed(1)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={10}
          step={0.5}
          value={ratingValue}
          onChange={(e) => setRatingValue(Number(e.target.value))}
          onMouseUp={(e) => onRatingCommit(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => onRatingCommit(Number((e.target as HTMLInputElement).value))}
          onKeyUp={(e) => {
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              onRatingCommit(Number((e.target as HTMLInputElement).value));
            }
          }}
          aria-label="Your rating, 0 to 10 in steps of 0.5"
          style={{
            width: "100%",
            accentColor: "var(--accent)",
            height: 44,
          }}
        />
      </div>

      {/* Friend ratings */}
      <CardDetailFriendRatings
        friendRatings={friendRatings}
        friendRatingsLoading={friendRatingsLoading}
      />

      {/* Tag chips */}
      <CardDetailTags
        tags={tags}
        canEdit={canEdit}
        onRemoveTag={onRemoveTag}
        onOpenTagPicker={onOpenTagPicker}
        onAddTag={onAddTag}
        tagPickerOpen={tagPickerOpen}
        setTagPickerOpen={setTagPickerOpen}
        availableTags={availableTags}
      />

      {/* Shared with */}
      {sharedWith.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-2)",
              marginBottom: 6,
            }}
          >
            Shared with {sharedWith.length}
          </div>
          <div style={{ display: "flex", gap: -4, flexWrap: "wrap" }}>
            {sharedWith.slice(0, 12).map((u, i) => (
              <div
                key={u.userId}
                title={u.displayName ?? "Unknown"}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  background: "var(--surface-4)",
                  color: "var(--text-1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 10,
                  fontWeight: 700,
                  border: "2px solid var(--surface-2)",
                  marginLeft: i === 0 ? 0 : -6,
                  flexShrink: 0,
                }}
              >
                {(u.displayName ?? "?").slice(0, 1).toUpperCase()}
              </div>
            ))}
            {sharedWith.length > 12 && (
              <div
                style={{
                  fontSize: 11,
                  color: "var(--text-3)",
                  marginLeft: 4,
                  alignSelf: "center",
                }}
              >
                +{sharedWith.length - 12}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          paddingTop: 4,
        }}
      >
        <button
          type="button"
          onClick={() => onShareClick?.(node.id)}
          style={actionBtn("neutral")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
          </svg>
          Share
        </button>
        <button
          type="button"
          onClick={onTrash}
          style={actionBtn("danger")}
          disabled={!isOwner}
          aria-disabled={!isOwner}
          title={isOwner ? undefined : "Only the owner can trash"}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
          </svg>
          Trash
        </button>
      </div>
    </div>
  );
}

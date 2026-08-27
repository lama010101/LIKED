"use client";

/**
 * SocialFeedView — Facebook/Instagram-style timeline feed.
 *
 * Shows all latest activity (cards + folders) as vertical "posts" that
 * can be scrolled indefinitely. Each post shows:
 *   - Author avatar + name + timestamp
 *   - Card: thumbnail/title/description/tags/source
 *   - Folder: color tile + name + card count
 *   - Action row: rate, share, comment (future)
 *
 * Uses useFeed hook for data (cursor pagination via get_feed RPC).
 * Folders are fetched separately and merged by created_at.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { FeedNode } from "@/lib/hooks/useFeed";
import type { Folder } from "@/lib/types/app";
import { useFeed } from "@/lib/hooks/useFeed";
import { supabaseBrowser } from "@/lib/supabase/client";
import { toast } from "@/lib/store/toastStore";
import CardDetailSheet from "@/components/modals/CardDetailSheet";

interface SocialFeedViewProps {
  initialNodes: FeedNode[];
  folders: Folder[];
  currentUserId: string;
  languageCode?: string;
}

/** Unified timeline item — either a card or a folder. */
interface TimelineItem {
  id: string;
  kind: "card" | "folder";
  createdAt: string;
  // Card fields
  title?: string;
  url?: string | null;
  textContent?: string | null;
  thumbnailKey?: string | null;
  ownerId?: string;
  tags?: Array<{ tag_id: string; color_hex: string; label: string }>;
  direction?: "own" | "sent" | "received";
  senderName?: string | null;
  senderAvatarKey?: string | null;
  avgRating?: number | null;
  source?: string;
  // Folder fields
  folderName?: string;
  folderColor?: string;
  folderCount?: number;
  folderThumbnails?: string[];
}

/** Convert FeedNode[] to TimelineItem[] */
function nodesToTimeline(nodes: FeedNode[]): TimelineItem[] {
  return nodes.map((n) => {
    let source: string | undefined;
    if (n.url) {
      try { source = new URL(n.url).hostname.replace(/^www\./, ""); } catch { /* ignore */ }
    }
    return {
      id: n.node_id,
      kind: "card" as const,
      createdAt: n.created_at,
      title: n.title ?? n.url ?? "Untitled",
      url: n.url,
      textContent: n.text_content,
      thumbnailKey: n.thumbnail_key,
      ownerId: n.owner_id,
      tags: n.tags,
      direction: n.direction,
      senderName: n.sender_name,
      senderAvatarKey: n.sender_avatar_key,
      avgRating: n.avg_rating,
      source,
    };
  });
}

/** Convert Folder[] to TimelineItem[] */
function foldersToTimeline(folders: Folder[]): TimelineItem[] {
  return folders.map((f) => ({
    id: f.id,
    kind: "folder" as const,
    createdAt: f.created_at,
    folderName: f.name,
    folderColor: f.color_hex || "#7c5cbf",
    folderCount: f.node_count,
    folderThumbnails: f.thumbnails,
  }));
}

/** Merge and sort by created_at descending */
function mergeTimeline(cards: TimelineItem[], folders: TimelineItem[]): TimelineItem[] {
  return [...cards, ...folders].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/** Relative time formatter — "2h ago", "just now", "3d ago" */
function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function SocialFeedView({
  initialNodes,
  folders,
  currentUserId,
  languageCode = "en",
}: SocialFeedViewProps) {
  const router = useRouter();
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [localFolders, setLocalFolders] = useState(folders);

  // Use the canonical feed hook — view=all, sort=newest
  const { nodes, isLoading, hasMore, loadMore } = useFeed({
    userId: currentUserId,
    languageCode,
  });

  // Use SSR nodes as initial data, then switch to hook data when it loads
  const displayNodes = nodes.length > 0 ? nodes : initialNodes;

  // Build timeline: merge cards + folders, sorted by recency
  const timeline = useMemo(
    () => mergeTimeline(nodesToTimeline(displayNodes), foldersToTimeline(localFolders)),
    [displayNodes, localFolders]
  );

  // Infinite scroll — IntersectionObserver on sentinel
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMoreRef.current) {
          loadingMoreRef.current = true;
          loadMore();
          // Reset flag after a short delay to allow loadMore to complete
          setTimeout(() => { loadingMoreRef.current = false; }, 500);
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const handleCardClick = useCallback((item: TimelineItem) => {
    if (item.kind === "card") {
      setActiveNodeId(item.id);
    } else if (item.kind === "folder") {
      router.push(`/feed?folder=${item.id}`);
    }
  }, [router]);

  const activeNode = useMemo(
    () => displayNodes.find((n) => n.node_id === activeNodeId) ?? null,
    [displayNodes, activeNodeId]
  );

  // Refresh folders periodically (in case new ones are created)
  useEffect(() => {
    const refreshFolders = async () => {
      try {
        const { data: { session } } = await supabaseBrowser.auth.getSession();
        if (!session?.user) return;
        const { data, error } = await supabaseBrowser
          .from("folders")
          .select("id, name, owner_id, parent_folder_id, is_project, color_hex, deleted_at, created_at")
          .eq("owner_id", session.user.id)
          .is("deleted_at", null)
          .order("created_at", { ascending: false });
        if (!error && data) {
          // Fetch counts separately
          const folderIds = data.map(f => f.id);
          if (folderIds.length > 0) {
            const { data: edges } = await supabaseBrowser
              .from("folder_edges")
              .select("folder_id")
              .in("folder_id", folderIds);
            const counts: Record<string, number> = {};
            (edges ?? []).forEach(e => {
              counts[e.folder_id] = (counts[e.folder_id] ?? 0) + 1;
            });
            setLocalFolders(data.map(f => ({
              id: f.id,
              name: f.name,
              owner_id: f.owner_id,
              parent_folder_id: f.parent_folder_id,
              is_project: f.is_project,
              color_hex: f.color_hex,
              deleted_at: f.deleted_at,
              created_at: f.created_at,
              node_count: counts[f.id] ?? 0,
              thumbnails: [],
            })));
          }
        }
      } catch {
        // Non-fatal
      }
    };
    refreshFolders();
  }, []);

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", paddingBottom: 100 }}>
      {/* Timeline */}
      {timeline.length === 0 && !isLoading && (
        <div style={{ padding: 80, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}>📭</div>
          <p style={{ color: "var(--text-3)", fontSize: 15, fontWeight: 600 }}>
            No activity yet
          </p>
          <p style={{ color: "var(--text-3)", fontSize: 13, marginTop: 4, opacity: 0.7 }}>
            Save cards and create folders to see them here
          </p>
        </div>
      )}

      {timeline.map((item) => (
        <TimelinePost
          key={item.id}
          item={item}
          currentUserId={currentUserId}
          onClick={() => handleCardClick(item)}
        />
      ))}

      {/* Loading state */}
      {isLoading && (
        <div style={{ padding: 20, textAlign: "center" }}>
          <div style={{
            width: 32, height: 32, borderRadius: "50%",
            border: "3px solid var(--surface-3)",
            borderTopColor: "var(--accent)",
            animation: "spin 0.8s linear infinite",
            margin: "0 auto",
          }} />
        </div>
      )}

      {/* Infinite scroll sentinel */}
      {hasMore && !isLoading && (
        <div ref={sentinelRef} style={{ height: 1 }} />
      )}

      {/* End of feed */}
      {!hasMore && timeline.length > 0 && (
        <div style={{ padding: 24, textAlign: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-3)" }}>
            You&apos;re all caught up ✓
          </span>
        </div>
      )}

      {/* Card detail sheet */}
      {activeNode && (
        <CardDetailSheet
          node={activeNode}
          currentUserId={currentUserId}
          onClose={() => setActiveNodeId(null)}
        />
      )}
    </div>
  );
}

// ── Timeline Post ─────────────────────────────────────────────

function TimelinePost({
  item,
  currentUserId,
  onClick,
}: {
  item: TimelineItem;
  currentUserId: string;
  onClick: () => void;
}) {
  const isOwn = item.ownerId === currentUserId;
  const authorName = item.direction === "received" && item.senderName
    ? item.senderName
    : isOwn
    ? "You"
    : "Someone";

  return (
    <article
      style={{
        background: "var(--surface-1)",
        borderBottom: "1px solid var(--border-1)",
        padding: "16px 16px 12px",
      }}
    >
      {/* Header: avatar + name + timestamp */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Avatar
          name={authorName}
          color={item.kind === "folder" ? item.folderColor : undefined}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-1)" }}>
            {authorName}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>
            {item.kind === "folder" ? "created a folder" : "saved a card"} · {timeAgo(item.createdAt)}
          </div>
        </div>
        {item.direction === "received" && (
          <div style={{
            fontSize: 10, fontWeight: 700,
            background: "var(--accent)", color: "#fff",
            padding: "2px 8px", borderRadius: 999,
          }}>
            SHARED
          </div>
        )}
      </div>

      {/* Content */}
      {item.kind === "card" ? (
        <CardContent item={item} onClick={onClick} />
      ) : (
        <FolderContent item={item} onClick={onClick} />
      )}

      {/* Action row */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        paddingTop: 10,
        marginTop: 8,
        borderTop: "1px solid var(--border-1)",
      }}>
        <ActionButton
          icon={<StarIcon />}
          label={item.avgRating ? `${item.avgRating.toFixed(1)}` : "Rate"}
          onClick={(e) => { e.stopPropagation(); toast.info("Rating coming soon"); }}
        />
        <ActionButton
          icon={<ShareIcon />}
          label="Share"
          onClick={(e) => { e.stopPropagation(); toast.info("Share coming soon"); }}
        />
        <ActionButton
          icon={<CommentIcon />}
          label="Comment"
          onClick={(e) => { e.stopPropagation(); toast.info("Comments coming soon"); }}
        />
      </div>
    </article>
  );
}

// ── Card Content ──────────────────────────────────────────────

function CardContent({ item, onClick }: { item: TimelineItem; onClick: () => void }) {
  const thumbUrl = item.thumbnailKey
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/thumbnails/${item.thumbnailKey}`
    : null;

  return (
    <div
      onClick={onClick}
      style={{ cursor: "pointer" }}
    >
      {/* Thumbnail */}
      {thumbUrl ? (
        <div style={{
          width: "100%",
          aspectRatio: "16 / 9",
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: 10,
          background: "var(--surface-3)",
        }}>
          <Image
            src={thumbUrl}
            alt={item.title ?? "Card thumbnail"}
            fill
            sizes="600px"
            unoptimized
            style={{ objectFit: "cover" }}
          />
        </div>
      ) : item.url ? (
        // URL card with link preview gradient
        <div style={{
          width: "100%",
          aspectRatio: "16 / 9",
          borderRadius: 12,
          marginBottom: 10,
          background: "var(--surface-3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="1.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>
      ) : item.textContent ? (
        // Text note
        <div style={{
          padding: 14,
          background: "var(--surface-2)",
          borderRadius: 12,
          marginBottom: 10,
          fontSize: 14,
          color: "var(--text-2)",
          lineHeight: 1.5,
          display: "-webkit-box",
          WebkitLineClamp: 4,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {item.textContent}
        </div>
      ) : null}

      {/* Title + source */}
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>
        {item.title}
      </div>
      {item.source && (
        <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 8 }}>
          {item.source}
        </div>
      )}

      {/* Tags */}
      {item.tags && item.tags.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {item.tags.slice(0, 5).map((tag) => (
            <span
              key={tag.tag_id}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: tag.color_hex,
                background: `${tag.color_hex}15`,
                padding: "3px 8px",
                borderRadius: 999,
              }}
            >
              {tag.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Folder Content ────────────────────────────────────────────

function FolderContent({ item, onClick }: { item: TimelineItem; onClick: () => void }) {
  const color = item.folderColor ?? "#7c5cbf";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const hasThumbs = item.folderThumbnails && item.folderThumbnails.length > 0;

  return (
    <div onClick={onClick} style={{ cursor: "pointer" }}>
      <div style={{
        width: "100%",
        aspectRatio: "16 / 9",
        borderRadius: 12,
        overflow: "hidden",
        marginBottom: 10,
        background: `linear-gradient(135deg, ${color}cc, ${color}66)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}>
        {hasThumbs ? (
          <div style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            width: "100%",
            height: "100%",
          }}>
            {item.folderThumbnails!.slice(0, 4).map((thumb, i) => (
              <div key={i} style={{ position: "relative", overflow: "hidden" }}>
                <Image
                  src={`${supabaseUrl}/storage/v1/object/public/thumbnails/${thumb}`}
                  alt=""
                  fill
                  sizes="300px"
                  unoptimized
                  style={{ objectFit: "cover" }}
                />
              </div>
            ))}
            {/* Fill empty slots with gradient */}
            {Array.from({ length: Math.max(0, 4 - (item.folderThumbnails?.length ?? 0)) }).map((_, i) => (
              <div key={`empty-${i}`} style={{ background: `${color}44` }} />
            ))}
          </div>
        ) : (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" aria-hidden="true">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" aria-hidden="true">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
        <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-1)" }}>
          {item.folderName}
        </div>
        {item.folderCount != null && item.folderCount > 0 && (
          <span style={{
            fontSize: 12, color: "var(--text-3)",
            background: "var(--surface-3)",
            padding: "2px 8px", borderRadius: 999,
          }}>
            {item.folderCount} {item.folderCount === 1 ? "card" : "cards"}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Primitives ────────────────────────────────────────────────

function Avatar({ name, color }: { name: string; color?: string }) {
  const initial = name.charAt(0).toUpperCase();
  const bg = color ?? "var(--accent)";
  return (
    <div style={{
      width: 40, height: 40, borderRadius: "50%",
      background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 16, fontWeight: 700, color: "#fff",
      flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 6,
        background: "none", border: "none",
        color: "var(--text-3)", fontSize: 13, fontWeight: 500,
        cursor: "pointer", padding: "4px 0",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function StarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

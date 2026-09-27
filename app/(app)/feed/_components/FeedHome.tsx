"use client";

/**
 * FeedHome — folder section (get_folders, Q12 distinct section) + card
 * feed rendered via get_feed results in one of 3 views (Q21):
 * list (default), masonry, columns. Horiz/FreeGrid are gone.
 */

import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FeedNode, FeedParams } from "@/lib/types/feed";
import { fetchFeedPageAction } from "@/app/lib/actions/feed";
import type { Mvp2Folder } from "@/app/lib/actions/mvp2";
import { moveNodeToFolderAction } from "@/app/lib/actions/mvp2";
import { toast } from "@/lib/store/toastStore";
import CardItem from "./CardItem";
import FolderTile from "./FolderTile";

type ViewMode = "list" | "masonry" | "columns";

export default function FeedHome({
  initialNodes, totalCount, nextCursor, folders, feedParams, query, meView,
}: {
  initialNodes: FeedNode[];
  totalCount: number;
  nextCursor: { createdAt: string; nodeId: string } | null;
  folders: Mvp2Folder[];
  feedParams: FeedParams;
  query: string | null;
  meView: boolean;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [view, setView] = useState<ViewMode>(() =>
    (typeof window !== "undefined" && (localStorage.getItem("liked.view") as ViewMode)) || "list");
  const [nodes, setNodes] = useState(initialNodes);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);

  const pickView = (v: ViewMode) => {
    setView(v);
    localStorage.setItem("liked.view", v);
  };

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const res = await fetchFeedPageAction({
        ...feedParams,
        p_cursor_created_at: cursor.createdAt,
        p_cursor_node_id: cursor.nodeId,
      } as FeedParams, false);
      setNodes((prev) => [...prev, ...res.nodes]);
      setCursor(res.nextCursor);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, feedParams, t]);

  // DnD: card dropped on a folder tile → move_node_to_folder RPC.
  const onDropToFolder = useCallback(async (nodeId: string, targetFolderId: string) => {
    try {
      await moveNodeToFolderAction(nodeId, null, targetFolderId);
      toast.success(t("add.added"));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    }
  }, [router, t]);

  return (
    <div className="feed-home">
      {/* Folder section — distinct from cards (Q12) */}
      {folders.length > 0 && (
        <section className="folder-section">
          <h2 className="sec-title">{t("feed.folders")}</h2>
          <div className="folder-row">
            {folders.map((f) => (
              <FolderTile key={f.id} folder={f} onDropCard={onDropToFolder} />
            ))}
          </div>
        </section>
      )}

      <div className="feed-head">
        <h2 className="sec-title">{query ? `"${query}"` : meView ? t("nav.me") : t("feed.cards")}</h2>
        <div className="seg view-seg" role="group" aria-label="view">
          {(["list", "masonry", "columns"] as const).map((v) => (
            <button
              key={v}
              className={`seg-btn ${view === v ? "seg-on" : ""}`}
              onClick={() => pickView(v)}
            >
              {t(`feed.view${v[0].toUpperCase()}${v.slice(1)}` as "feed.viewList")}
            </button>
          ))}
        </div>
      </div>

      {nodes.length === 0 ? (
        <p className="empty-note">{query ? t("feed.emptySearch", { q: query }) : t("feed.empty")}</p>
      ) : (
        <div className={`cards cards-${view}`}>
          {nodes.map((n) => (
            <Link key={n.node_id} href={`/card/${n.node_id}`} className="card-link">
              <CardItem node={n} />
            </Link>
          ))}
        </div>
      )}

      {cursor && (
        <button className="btn load-more" onClick={loadMore} disabled={loading}>
          {loading ? t("common.loading") : `${t("feed.loadMore")} (${nodes.length}/${totalCount})`}
        </button>
      )}
    </div>
  );
}

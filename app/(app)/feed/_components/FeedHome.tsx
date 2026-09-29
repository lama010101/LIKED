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
import CardItem from "../../_components/CardItem";
import ViewSwitch, { useCardView } from "../../_components/ViewSwitch";
import FolderTile from "./FolderTile";

export default function FeedHome({
  initialNodes, totalCount, nextCursor, folders, feedParams, query, meView, activeFolderId,
}: {
  initialNodes: FeedNode[];
  totalCount: number;
  nextCursor: { createdAt: string; nodeId: string } | null;
  folders: Mvp2Folder[];
  feedParams: FeedParams;
  query: string | null;
  meView: boolean;
  activeFolderId: string | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [view, pickView] = useCardView();
  const [nodes, setNodes] = useState(initialNodes);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);

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
              <FolderTile key={f.id} folder={f} onDropCard={onDropToFolder} active={f.id === activeFolderId} />
            ))}
          </div>
        </section>
      )}

      <div className="feed-head">
        <h2 className="sec-title">{query ? `"${query}"` : activeFolderId ? (folders.find((f) => f.id === activeFolderId)?.name ?? t("feed.cards")) : meView ? t("nav.me") : t("feed.cards")}</h2>
        <ViewSwitch view={view} onPick={pickView} />
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

"use client";

/**
 * FeedHome — folder section (get_folders, Q12 distinct section) + card
 * feed rendered via get_feed results in one of 3 views (Q21):
 * list (default), masonry, columns. Horiz/FreeGrid are gone.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FeedNode, FeedParams } from "@/lib/types/feed";
import { fetchFeedPageAction } from "@/app/lib/actions/feed";
import type { Mvp2Folder } from "@/app/lib/actions/mvp2";
import { getNodeFoldersAction, moveNodeToFolderAction } from "@/app/lib/actions/mvp2";
import { toast } from "@/lib/store/toastStore";
import CardItem from "../../_components/CardItem";
import ViewSwitch, { useCardView } from "../../_components/ViewSwitch";
import Avatar from "../../_components/Avatar";
import { getLayoutPref, type LayoutPref } from "../../_components/prefs";
import FolderTile from "./FolderTile";
import type { FriendBarEntry } from "@/lib/db/friends";

export default function FeedHome({
  initialNodes, totalCount, nextCursor, folders, feedParams, query, meView, activeFolderId, friends,
}: {
  initialNodes: FeedNode[];
  totalCount: number;
  nextCursor: { createdAt: string; nodeId: string } | null;
  folders: Mvp2Folder[];
  feedParams: FeedParams;
  query: string | null;
  meView: boolean;
  activeFolderId: string | null;
  /** Full friend bar entries — only fetched/passed under a search (?q=). */
  friends: FriendBarEntry[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [view, pickView] = useCardView();
  const [nodes, setNodes] = useState(initialNodes);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);
  // Card ordering pref (UX-BATCH-004): "created" (default, newest first)
  // or "alpha". Persisted in localStorage, synced via liked:prefs — same
  // store mechanism as the folder sort in FolderRail.
  const subscribePrefs = useCallback((onChange: () => void) => {
    window.addEventListener("liked:prefs", onChange);
    return () => window.removeEventListener("liked:prefs", onChange);
  }, []);
  const cardSort = useSyncExternalStore(
    subscribePrefs,
    () => (localStorage.getItem("liked.cardSort") === "alpha" ? "alpha" : "created"),
    () => "created"
  );
  // Layout pref — under friends-top the body .folder-section is display:none
  // (folders live in the left rail), so folder hits can't count as visible
  // search results there or suppressCards would blank the page.
  const layout = useSyncExternalStore(subscribePrefs, getLayoutPref, () => "friends-left" as LayoutPref);
  const sortedNodes = cardSort === "alpha"
    ? [...nodes].sort((a, b) => (a.title ?? a.text_content ?? "").localeCompare(b.title ?? b.text_content ?? ""))
    : nodes;

  // Resync on router.refresh(): refresh delivers new props without remounting
  // (the key only covers params), so paginated state would otherwise stay
  // stale — this hid newly added YouTube cards until a manual reload.
  const [prevProps, setPrevProps] = useState({ initialNodes, nextCursor });
  if (prevProps.initialNodes !== initialNodes || prevProps.nextCursor !== nextCursor) {
    setPrevProps({ initialNodes, nextCursor });
    setNodes(initialNodes);
    setCursor(nextCursor);
  }

  // Card → folder labels (UX-BATCH-004): lazily resolve folder_edges for
  // each new batch of nodes, keyed map survives pagination.
  const [nodeFolders, setNodeFolders] = useState<Record<string, string>>({});
  useEffect(() => {
    const missing = nodes.map((n) => n.node_id).filter((id) => !(id in nodeFolders));
    if (missing.length === 0) return;
    getNodeFoldersAction(missing)
      .then((map) => setNodeFolders((prev) => ({ ...prev, ...map })))
      .catch(() => {});
  }, [nodes, nodeFolders]);
  const folderName = (id: string | undefined) => (id ? folders.find((f) => f.id === id)?.name ?? null : null);

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

  // Grouped search results (UX-SEARCH-GROUPS-001): under ?q=, friends
  // matching the term render as their own section next to the already
  // filtered folder + card sections. Same match semantics as FriendsRail
  // (user_id present, display_name substring, case-insensitive).
  const qLower = (query ?? "").trim().toLowerCase();
  const matchingFriends = qLower
    ? friends.filter((f) => f.user_id && (f.display_name ?? "").toLowerCase().includes(qLower))
    : [];
  // If a search matched folders/friends but zero cards, skip the cards
  // block entirely — the sections above already communicate results.
  // (Folder hits only count when the folder section is actually visible.)
  const suppressCards = !!query && nodes.length === 0 &&
    (matchingFriends.length > 0 || (layout !== "friends-top" && folders.length > 0));

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

      {/* Friends section — grouped search results (UX-SEARCH-GROUPS-001) */}
      {matchingFriends.length > 0 && (
        <section className="friend-section">
          <h2 className="sec-title">{t("nav.friends")}</h2>
          <div className="friend-row">
            {matchingFriends.map((f) => (
              <Link key={f.user_id} href={`/feed?friend=${f.user_id}`} className="rail-item" title={f.display_name ?? ""}>
                <Avatar userId={f.user_id!} avatarKey={f.avatar_key} name={f.display_name ?? "?"} size={80} />
                <span className="rail-label">{f.display_name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!suppressCards && (
        <>
      <div className="feed-head">
        <h2 className="sec-title">{query ? `"${query}"` : activeFolderId ? (folders.find((f) => f.id === activeFolderId)?.name ?? t("feed.cards")) : meView ? t("nav.me") : t("feed.cards")}</h2>
        <div className="feed-head-side">
          <div className="seg" role="group" aria-label={t("folder.sort")}>
            <button
              type="button"
              className={`seg-btn ${cardSort === "created" ? "seg-on" : ""}`}
              onClick={() => { localStorage.setItem("liked.cardSort", "created"); window.dispatchEvent(new Event("liked:prefs")); }}
            >{t("folder.sortCreated")}</button>
            <button
              type="button"
              className={`seg-btn ${cardSort === "alpha" ? "seg-on" : ""}`}
              onClick={() => { localStorage.setItem("liked.cardSort", "alpha"); window.dispatchEvent(new Event("liked:prefs")); }}
            >{t("folder.sortAlpha")}</button>
          </div>
          <ViewSwitch view={view} onPick={pickView} />
        </div>
      </div>

      {nodes.length === 0 ? (
        <p className="empty-note">{query ? t("feed.emptySearch", { q: query }) : t("feed.empty")}</p>
      ) : (
        <div className={`cards cards-${view}`}>
          {sortedNodes.map((n) => {
            const fid = nodeFolders[n.node_id];
            const fname = folderName(fid);
            return (
              <Link key={n.node_id} href={`/card/${n.node_id}`} className="card-link">
                <CardItem node={n} folder={fid && fname ? { id: fid, name: fname } : null} />
              </Link>
            );
          })}
        </div>
      )}

      {cursor && (
        <button className="btn load-more" onClick={loadMore} disabled={loading}>
          {loading ? t("common.loading") : `${t("feed.loadMore")} (${nodes.length}/${totalCount})`}
        </button>
      )}
        </>
      )}
    </div>
  );
}

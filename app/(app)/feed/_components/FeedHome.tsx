"use client";

/**
 * FeedHome — folder section (get_folders, Q12 distinct section) + card
 * feed rendered via get_feed results in one of 3 views (Q21):
 * list (default), masonry, columns. Horiz/FreeGrid are gone.
 */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { FeedNode, FeedParams } from "@/lib/types/feed";
import { fetchFeedPageAction } from "@/app/lib/actions/feed";
import type { Mvp2Folder, NodeContext } from "@/app/lib/actions/mvp2";
import {
  autoTagNodesAction, getNodeContextAction, getNodeFoldersAction,
  getUnclassifiedOwnNodesAction, moveNodeToFolderAction,
} from "@/app/lib/actions/mvp2";
import { toast } from "@/lib/store/toastStore";
import CardItem from "../../_components/CardItem";
import ViewSwitch, { useCardView, type ViewMode } from "../../_components/ViewSwitch";
import Avatar from "../../_components/Avatar";
import { getLayoutPref, type LayoutPref } from "../../_components/prefs";
import FolderTile from "./FolderTile";
import type { FriendBarEntry } from "@/lib/db/friends";

type GroupBy = "theme" | "channel" | "folder";

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
  const searchParams = useSearchParams();
  const [view, pickView] = useCardView();
  const [nodes, setNodes] = useState(initialNodes);
  const [cursor, setCursor] = useState(nextCursor);
  const [loading, setLoading] = useState(false);
  // Card ordering (AUDIT-09 P2-1): the sort is a get_feed input
  // (p_sort), not a client-side reorder — the seg writes ?sort= into
  // the URL so the server re-fetches in SQL order (incl. pagination).
  const cardSort = feedParams.p_sort === "alpha" ? "alpha" : "created";
  const setCardSort = (v: "created" | "alpha") => {
    const sp = new URLSearchParams(searchParams.toString());
    if (v === "alpha") sp.set("sort", "alpha"); else sp.delete("sort");
    router.push(`/feed?${sp.toString()}`);
  };

  // Layout pref — under friends-top the body .folder-section is display:none
  // (folders live in the left rail), so folder hits can't count as visible
  // search results there or suppressCards would blank the page.
  const subscribePrefs = useCallback((onChange: () => void) => {
    window.addEventListener("liked:prefs", onChange);
    return () => window.removeEventListener("liked:prefs", onChange);
  }, []);
  const layout = useSyncExternalStore(subscribePrefs, getLayoutPref, () => "friends-left" as LayoutPref);

  // Grouped search (query-only): theme/channel/folder via URL ?group=
  const groupBy = (searchParams.get("group") as GroupBy) || "theme";

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

  // node_id → {theme, subtheme, channelTitle, folder} for grouped search —
  // lazy-loaded per batch exactly like nodeFolders.
  const [nodeCtx, setNodeCtx] = useState<Record<string, NodeContext>>({});
  useEffect(() => {
    if (!query) return;
    const missing = nodes.map((n) => n.node_id).filter((id) => !(id in nodeCtx));
    if (missing.length === 0) return;
    getNodeContextAction(missing)
      .then((map) => setNodeCtx((prev) => ({ ...prev, ...map })))
      .catch(() => {});
  }, [nodes, nodeCtx, query]);

  // "Tag my cards" backfill — classifies ALL own unclassified cards
  // (bounded by the action's own cap), then refreshes the context map.
  const [tagging, setTagging] = useState(false);
  const unclassified = nodes.filter(
    (n) => n.direction !== "received" && nodeCtx[n.node_id] && !nodeCtx[n.node_id].theme
  );
  const runTagging = useCallback(async (ids: string[]) => {
    setTagging(true);
    try {
      for (let i = 0; i < ids.length; i += 50) {
        await autoTagNodesAction(ids.slice(i, i + 50)).catch(() => null);
      }
      // re-fetch context for every visible node so groups re-bucket
      const map = await getNodeContextAction(nodes.map((n) => n.node_id)).catch(() => null);
      if (map) setNodeCtx(map);
      toast.success(t("common.done"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("common.error"));
    } finally {
      setTagging(false);
    }
  }, [nodes, t]);

  // Groups keyed by the active dimension; card order inside each group
  // keeps get_feed order. Ungrouped cards land in the trailing bucket.
  const groups = useMemo(() => {
    if (!query) return null;
    const byTheme = new Map<string, Map<string, FeedNode[]>>();
    const flat = new Map<string, FeedNode[]>();
    const misc: FeedNode[] = [];
    for (const n of nodes) {
      const ctx = nodeCtx[n.node_id];
      if (groupBy === "theme") {
        if (!ctx?.theme) { misc.push(n); continue; }
        const sub = ctx.subtheme ?? "";
        if (!byTheme.has(ctx.theme)) byTheme.set(ctx.theme, new Map());
        const subMap = byTheme.get(ctx.theme)!;
        if (!subMap.has(sub)) subMap.set(sub, []);
        subMap.get(sub)!.push(n);
      } else if (groupBy === "channel") {
        const key = ctx?.channelTitle ?? "";
        if (!key) { misc.push(n); continue; }
        if (!flat.has(key)) flat.set(key, []);
        flat.get(key)!.push(n);
      } else {
        const key = ctx?.folderName ?? "";
        if (!key) { misc.push(n); continue; }
        if (!flat.has(key)) flat.set(key, []);
        flat.get(key)!.push(n);
      }
    }
    const sortedThemes = [...byTheme.keys()].sort((a, b) => a.localeCompare(b));
    const sortedFlat = [...flat.keys()].sort((a, b) => a.localeCompare(b));
    return { byTheme, sortedThemes, flat, sortedFlat, misc };
  }, [nodes, nodeCtx, query, groupBy]);

  const pickGroup = (g: GroupBy) => {
    const p = new URLSearchParams(window.location.search);
    p.set("group", g);
    router.push(`/feed?${p.toString()}`);
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
              onClick={() => setCardSort("created")}
            >{t("folder.sortCreated")}</button>
            <button
              type="button"
              className={`seg-btn ${cardSort === "alpha" ? "seg-on" : ""}`}
              onClick={() => setCardSort("alpha")}
            >{t("folder.sortAlpha")}</button>
          </div>
          {query && (
            <div className="seg" role="group" aria-label={t("search.groupBy")}>
              {(["theme", "channel", "folder"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`seg-btn ${groupBy === g ? "seg-on" : ""}`}
                  onClick={() => pickGroup(g)}
                >
                  {t(`search.${g}`)}
                </button>
              ))}
            </div>
          )}
          <ViewSwitch view={view} onPick={pickView} />
        </div>
      </div>

      {query && unclassified.length > 0 && (
        <button
          type="button"
          className="btn btn-sm autotag-btn"
          disabled={tagging}
          onClick={async () => {
            const ownIds = await getUnclassifiedOwnNodesAction().catch(() => [] as string[]);
            const ids = ownIds.length > 0 ? ownIds : unclassified.map((n) => n.node_id);
            runTagging(ids);
          }}
        >
          {tagging ? t("search.tagging") : t("search.tagAll", { count: unclassified.length })}
        </button>
      )}

      {nodes.length === 0 ? (
        <p className="empty-note">{query ? t("feed.emptySearch", { q: query }) : t("feed.empty")}</p>
      ) : query && groups ? (
        <div className="feed-groups">
          {groupBy === "theme" ? (
            <>
              {groups.sortedThemes.map((theme) => {
                const subMap = groups.byTheme.get(theme)!;
                const total = [...subMap.values()].reduce((n, arr) => n + arr.length, 0);
                const direct = subMap.get("") ?? [];
                const subs = [...subMap.keys()].filter((k) => k !== "").sort((a, b) => a.localeCompare(b));
                return (
                  <section key={theme} className="feed-group">
                    <h3 className="feed-group-title">{theme} <span className="feed-group-count">{total}</span></h3>
                    {direct.length > 0 && <CardGrid nodes={direct} view={view} nodeFolders={nodeFolders} folderName={folderName} />}
                    {subs.map((sub) => (
                      <div key={sub} className="feed-subgroup">
                        <h4 className="feed-subgroup-title">{sub} <span className="feed-group-count">{subMap.get(sub)!.length}</span></h4>
                        <CardGrid nodes={subMap.get(sub)!} view={view} nodeFolders={nodeFolders} folderName={folderName} />
                      </div>
                    ))}
                  </section>
                );
              })}
            </>
          ) : (
            groups.sortedFlat.map((key) => (
              <section key={key} className="feed-group">
                <h3 className="feed-group-title">{key} <span className="feed-group-count">{groups.flat.get(key)!.length}</span></h3>
                <CardGrid nodes={groups.flat.get(key)!} view={view} nodeFolders={nodeFolders} folderName={folderName} />
              </section>
            ))
          )}
          {groups.misc.length > 0 && (
            <section className="feed-group">
              <h3 className="feed-group-title">{t("search.unclassified")} <span className="feed-group-count">{groups.misc.length}</span></h3>
              <CardGrid nodes={groups.misc} view={view} nodeFolders={nodeFolders} folderName={folderName} />
            </section>
          )}
        </div>
      ) : (
        <div className={`cards cards-${view}`}>
          {nodes.map((n) => {
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

/** One card grid — shared by the flat feed and each grouped-search section. */
function CardGrid({
  nodes, view, nodeFolders, folderName,
}: {
  nodes: FeedNode[];
  view: ViewMode;
  nodeFolders: Record<string, string>;
  folderName: (id: string | undefined) => string | null;
}) {
  return (
    <div className={`cards cards-${view}`}>
      {nodes.map((n) => {
        const fid = nodeFolders[n.node_id];
        const fname = folderName(fid);
        return (
          <Link key={n.node_id} href={`/card/${n.node_id}`} className="card-link">
            <CardItem node={n} folder={fid && fname ? { id: fid, name: fname } : null} />
          </Link>
        );
      })}
    </div>
  );
}

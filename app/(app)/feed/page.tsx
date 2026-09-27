import { getFeed } from "@/lib/db/feed";
import { getSessionUser } from "@/app/lib/actions/session";
import { getFoldersAction } from "@/app/lib/actions/mvp2";
import FeedHome from "./_components/FeedHome";
import { redirect } from "next/navigation";

/**
 * Home feed (Phase 5). All node visibility/filtering/sorting/pagination
 * is delegated to get_feed — this page only maps URL params → FeedParams
 * and renders the result. Folders come from get_folders (Q12) and render
 * as a distinct section, never merged into the card list client-side.
 */
export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const q = s("q") ?? null;
  const friend = s("friend") ?? null;
  const me = s("me") === "1";
  const tag = s("tag") ?? null;
  const sort = s("sort") ?? "newest";

  const params = {
    p_user_id: user.id,
    p_language_code: user.language_code ?? "en",
    p_view: "all",
    p_friend_id: friend,
    p_filter_tag_ids: tag ? [tag] : null,
    p_search_query: q,
    p_sort: sort,
    // Home shows unfiled cards only; friend/search/me views see everything.
    p_exclude_foldered: !q && !friend && !me,
  } as import("@/lib/types/feed").FeedParams;

  const [feed, folders] = await Promise.all([
    getFeed(params, true),
    getFoldersAction({ search: q, tagIds: tag ? [tag] : null, friendId: me ? user.id : friend }),
  ]);

  return (
    <FeedHome
      initialNodes={feed.nodes}
      totalCount={feed.totalCount}
      nextCursor={feed.nextCursor}
      folders={folders}
      feedParams={params}
      query={q}
      friendId={friend}
      meView={me}
      userId={user.id}
    />
  );
}

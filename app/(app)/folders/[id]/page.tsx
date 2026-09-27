import { getSessionUser } from "@/app/lib/actions/session";
import { getFolderAction, getFolderAccessAction } from "@/app/lib/actions/mvp2";
import { getFeed } from "@/lib/db/feed";
import { redirect, notFound } from "next/navigation";
import FolderView from "./_components/FolderView";

/**
 * Folder detail (Phase 5): header + breadcrumb + children + member cards.
 * Member cards still come from get_feed (SQL-authoritative, p_folder_id).
 * Access list is fetched owner-only — the RPC rejects non-owners (Q20).
 */
export default async function FolderPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const folder = await getFolderAction(id).catch(() => null);
  if (!folder) notFound();

  const feed = await getFeed(
    {
      p_user_id: user.id,
      p_language_code: user.language_code ?? "en",
      p_view: "all",
      p_folder_id: id,
      p_sort: "newest",
      p_exclude_foldered: false,
    } as import("@/lib/types/feed").FeedParams,
    true
  );

  const isOwner = folder.owner_id === user.id;
  const access = isOwner ? await getFolderAccessAction(id) : [];

  return (
    <FolderView
      folder={folder}
      nodes={feed.nodes}
      totalCount={feed.totalCount}
      access={access}
      isOwner={isOwner}
      myPermission={folder.my_permission}
    />
  );
}

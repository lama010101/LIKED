import { getSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getFeed, type FeedNode } from "@/lib/db/feed";
import { getUserFolders } from "@/lib/db/folders";
import { parseURLToFilterState, buildFeedParams } from "@/lib/utils/feedParams";
import { type FilterState } from "@/lib/store/filterStore";
import FeedGrid from "./_components/FeedGrid";

interface FeedPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const resolvedSearchParams = await searchParams;
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // P9-T06-FIX: Parse full filter state from URL (deterministic, normalized)
  const filterState = parseURLToFilterState(resolvedSearchParams);

  // P9-T06-FIX: Canonical feed path — buildFeedParams → getFeed → get_feed RPC
  const feedParams = buildFeedParams(filterState, user.id);
  const { nodes, totalCount, nextCursor } = await getFeed(feedParams, true);

  // FOLDER-004: Fetch user's folders for feed UI
  const folders = await getUserFolders();

  return (
    <div className="min-h-[60vh]" style={{ background: 'var(--bg)' }}>
      <FeedGrid
        nodes={nodes}
        currentUserId={user.id}
        initialFilterState={filterState}
        totalCount={totalCount}
        nextCursor={nextCursor}
        folders={folders}
      />
    </div>
  );
}

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getVisibleNodes, type FeedView, type MineSubFilter } from "@/lib/db/visibility";
import { parseURLToFilterState } from "@/lib/utils/feedParams";
import { type FilterState } from "@/lib/store/filterStore";
import FeedGrid from "./_components/FeedGrid";

interface FeedPageProps {
  searchParams: { [key: string]: string | string[] | undefined };
}

export default async function FeedPage({ searchParams }: FeedPageProps) {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // P9-T03-B: Parse full filter state from URL (deterministic, normalized)
  const filterState = parseURLToFilterState(searchParams);

  // Map filterState view to legacy getVisibleNodes params (until get_feed RPC is wired)
  const view: FeedView = filterState.view;
  const mineFilter: MineSubFilter = filterState.mineSubTab;

  const nodes = await getVisibleNodes(user.id, view, mineFilter);

  return (
    <div className="min-h-[60vh] bg-[#F8F6F2]">
      <FeedGrid
        nodes={nodes}
        currentUserId={user.id}
        feedView={view}
        mineFilter={mineFilter}
        initialFilterState={filterState}
      />
    </div>
  );
}

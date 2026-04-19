import { getSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getVisibleNodes, type FeedView, type MineSubFilter } from "@/lib/db/visibility";
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

  // P9-T01: Read feed view from URL search params (SSR)
  const viewParam = typeof searchParams.view === 'string' ? searchParams.view : 'all';
  const mineParam = typeof searchParams.mine === 'string' ? searchParams.mine : 'all';

  const view: FeedView = ['all', 'mine', 'received'].includes(viewParam) ? (viewParam as FeedView) : 'all';
  const mineFilter: MineSubFilter = ['all', 'not_shared', 'shared'].includes(mineParam)
    ? (mineParam as MineSubFilter)
    : 'all';

  const nodes = await getVisibleNodes(user.id, view, mineFilter);

  return (
    <div className="min-h-[60vh] bg-[#F8F6F2]">
      <FeedGrid nodes={nodes} currentUserId={user.id} feedView={view} mineFilter={mineFilter} />
    </div>
  );
}

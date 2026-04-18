import { getSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getVisibleNodes } from "@/lib/db/visibility";
import FeedGrid from "./_components/FeedGrid";
import AddNodeBar from "./_components/AddNodeBar";

export default async function FeedPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const nodes = await getVisibleNodes(user.id);

  return (
    <div className="min-h-[60vh] bg-[#F8F6F2]">
      {/* TEMP: replaced by FAB in P5 */}
      <AddNodeBar />
      <FeedGrid nodes={nodes} />
    </div>
  );
}

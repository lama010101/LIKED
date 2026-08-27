import { getSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getFeed } from "@/lib/db/feed";
import { getUserFolders } from "@/lib/db/folders";
import { buildFeedParams } from "@/lib/utils/feedParams";
import { DEFAULT_FILTER_STATE } from "@/lib/store/filterStore";
import SocialFeedView from "../feed/_components/SocialFeedView";

/**
 * Social Feed page — Facebook/Instagram-style timeline.
 *
 * Shows all latest activity (cards + folders) as scrollable posts.
 * Uses the same canonical get_feed RPC as the grid feed, with
 * view=all and sort=newest. Folders are merged in by created_at.
 */
export default async function SocialPage() {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch feed data (view=all, sort=newest) + folders in parallel
  const feedParams = buildFeedParams(
    { ...DEFAULT_FILTER_STATE, view: "all", sort: "newest" },
    user.id
  );

  const [feedResult, folders] = await Promise.all([
    getFeed(feedParams, true),
    getUserFolders(),
  ]);

  return (
    <div style={{ background: "var(--bg)", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "var(--surface-1)",
        borderBottom: "1px solid var(--border-1)",
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <h1 style={{
          fontSize: 20, fontWeight: 700,
          color: "var(--text-1)", margin: 0,
          letterSpacing: "-0.01em",
        }}>
          Activity Feed
        </h1>
        <a
          href="/feed"
          style={{
            fontSize: 13, fontWeight: 600,
            color: "var(--text-3)",
            textDecoration: "none",
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          Grid view
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        </a>
      </div>

      <SocialFeedView
        initialNodes={feedResult.nodes}
        folders={folders}
        currentUserId={user.id}
        languageCode={user.user_metadata?.language_code ?? "en"}
      />
    </div>
  );
}

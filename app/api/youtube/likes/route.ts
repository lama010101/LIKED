import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getStoredYouTubeToken, fetchLikedVideos } from "@/lib/youtube/client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageToken = searchParams.get("pageToken") ?? undefined;

    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const auth = await getStoredYouTubeToken(user.id);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: 401 });
    }

    const result = await fetchLikedVideos(auth.token.accessToken, pageToken);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({
      videos: result.videos,
      nextPageToken: result.nextPageToken,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getStoredYouTubeToken, searchYouTubeVideos } from "@/lib/youtube/client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    if (q.length < 2) {
      return NextResponse.json(
        { error: "Search query must be at least 2 characters." },
        { status: 400 }
      );
    }

    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const auth = await getStoredYouTubeToken(user.id);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.message, code: "not_connected" },
        { status: 401 }
      );
    }

    const result = await searchYouTubeVideos(auth.token.accessToken, q);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ videos: result.videos });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

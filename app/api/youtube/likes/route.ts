import { NextResponse } from "next/server";
import { getYouTubeAccessToken, fetchLikedVideos } from "@/lib/youtube/client";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const pageToken = searchParams.get("pageToken") ?? undefined;

    const auth = await getYouTubeAccessToken();
    if (!auth.ok || !auth.accessToken) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const result = await fetchLikedVideos(auth.accessToken, pageToken);

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

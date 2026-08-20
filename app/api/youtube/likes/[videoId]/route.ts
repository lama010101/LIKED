import { NextResponse } from "next/server";
import { getYouTubeAccessToken, unlikeVideo } from "@/lib/youtube/client";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  const auth = await getYouTubeAccessToken();
  if (!auth.ok || !auth.accessToken) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const result = await unlikeVideo(auth.accessToken, videoId);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

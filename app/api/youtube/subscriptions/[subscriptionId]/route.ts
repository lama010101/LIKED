import { NextResponse } from "next/server";
import { getYouTubeAccessToken, unsubscribeFromChannel } from "@/lib/youtube/client";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ subscriptionId: string }> }
) {
  try {
    const { subscriptionId } = await params;

    if (!subscriptionId) {
      return NextResponse.json({ error: "Missing subscriptionId" }, { status: 400 });
    }

    const auth = await getYouTubeAccessToken();
    if (!auth.ok || !auth.accessToken) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    const result = await unsubscribeFromChannel(auth.accessToken, subscriptionId);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getStoredYouTubeToken, hasYouTubeWriteScope, unsubscribeFromChannel, YOUTUBE_SCOPE_MESSAGE } from "@/lib/youtube/client";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ subscriptionId: string }> }
) {
  try {
    const { subscriptionId } = await params;

    if (!subscriptionId) {
      return NextResponse.json({ error: "Missing subscriptionId" }, { status: 400 });
    }

    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const auth = await getStoredYouTubeToken(user.id);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: 401 });
    }

    // YT-SCOPE-GUARD-001: known readonly grant → fail fast with the scope message
    // (null = scopes never recorded → let the API's own 403 decide).
    if (hasYouTubeWriteScope(auth.token.scopes) === false) {
      return NextResponse.json({ error: YOUTUBE_SCOPE_MESSAGE }, { status: 403 });
    }

    const result = await unsubscribeFromChannel(auth.token.accessToken, subscriptionId);

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

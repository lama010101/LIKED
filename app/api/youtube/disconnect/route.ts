import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { decryptToken } from "@/lib/youtube/token-crypto";
import { logger } from "@/lib/utils/logger";

interface ConnectionTokenRow {
  access_token: string | null;
  refresh_token: string | null;
}

export async function POST() {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Read stored (encrypted) tokens — ciphertext stays server-side.
    // New token columns are not in the generated Database type yet.
    const { data: row } = await supabase
      .from("youtube_connections")
      .select("access_token, refresh_token")
      .eq("user_id", user.id)
      .maybeSingle();
    const tokens = row as unknown as ConnectionTokenRow | null;

    // Revoke the Google grant. Revoking the refresh token also kills
    // access tokens derived from it; fall back to the access token when
    // no refresh token is stored.
    let revokeToken: string | null = null;
    try {
      if (tokens?.refresh_token) {
        revokeToken = decryptToken(tokens.refresh_token);
      } else if (tokens?.access_token) {
        revokeToken = decryptToken(tokens.access_token);
      }
    } catch {
      logger.warn("[youtube/disconnect] Stored token could not be decrypted; skipping Google revoke");
    }

    if (revokeToken) {
      try {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${revokeToken}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
      } catch {
        // Continue with local disconnect even if Google revoke fails
      }
    }

    // Mark as revoked locally and delete the stored tokens.
    await supabase
      .from("youtube_connections")
      .update({
        revoked_at: new Date().toISOString(),
        access_token: null,
        refresh_token: null,
        token_expires_at: null,
      } as never)
      .eq("user_id", user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

"use server";

/**
 * Server action: read the persisted custom node ordering for
 * (user, scopeKey) from user_node_preferences (single source of truth —
 * AUDIT-06 P2-1). Read-only; returns [] when unauthenticated or unset.
 */

import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getCustomOrder } from "@/lib/db/nodePreferences";
import { logger } from "@/lib/utils/logger";

export async function getCustomOrderAction(scopeKey: string): Promise<string[]> {
  try {
    const supabase = await getSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];
    return await getCustomOrder(user.id, scopeKey);
  } catch (err) {
    logger.error("[getCustomOrderAction] error:", err);
    return [];
  }
}

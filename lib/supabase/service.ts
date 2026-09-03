import { createClient } from "@supabase/supabase-js";
import { Database } from "@/lib/types/database";

/**
 * Service role client for server-side write operations.
 * ⚠️ CRITICAL: This client uses the SUPABASE_SECRET_KEY which has admin privileges.
 * - NEVER import this in client components
 * - ONLY use this in Server Actions, API routes, or Server Components
 * - NEVER expose the secret key to the browser
 */
export function getSupabaseServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SECRET_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY is not set. This key is required for server-side write operations."
    );
  }

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

"use client";

import { createBrowserClient } from "@supabase/ssr";
import { Database } from "@/lib/types/database";

export type TypedSupabaseClient = ReturnType<typeof createBrowserClient<Database>>;

let clientInstance: TypedSupabaseClient | null = null;

export function getSupabaseBrowserClient(): TypedSupabaseClient {
  if (clientInstance) {
    return clientInstance;
  }

  clientInstance = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  return clientInstance;
}

// Singleton browser client export
export const supabaseBrowser = getSupabaseBrowserClient();

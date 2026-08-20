import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Database } from "@/lib/types/database";

export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // This can happen in Server Components where cookies can't be modified
            // The middleware will handle session refreshing
          }
        },
      },
    }
  );
}

export const createServerSupabaseClient = getSupabaseServerClient;

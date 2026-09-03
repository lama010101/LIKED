import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/types/database'

/**
 * Dynamic RPC helper. `fn` is a runtime string, so the static Database
 * function-name typing cannot apply here; cast only the `rpc` method
 * (not the whole client) to a loose signature.
 */
type DynamicRpc = (
  fn: string,
  params: Record<string, unknown>
) => Promise<{ data: unknown; error: { message: string } | null }>

export async function rpc<T>(
  fn: string,
  params: Record<string, unknown>
): Promise<T> {
  const supabase = await getSupabaseServerClient()

  const looseClient = supabase as SupabaseClient<Database> & { rpc: DynamicRpc }
  const { data, error } = await looseClient.rpc(fn, params)

  if (error) {
    throw new Error(`[RPC:${fn}] ${error.message}`)
  }

  return data as T
}

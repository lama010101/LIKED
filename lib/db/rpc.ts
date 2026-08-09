import { getSupabaseServerClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any

export async function rpc<T>(
  fn: string,
  params: Record<string, unknown>
): Promise<T> {
  const supabase = await getSupabaseServerClient()

  const { data, error } = await (supabase as AnySupabase).rpc(fn, params)

  if (error) {
    throw new Error(`[RPC:${fn}] ${error.message}`)
  }

  return data as T
}

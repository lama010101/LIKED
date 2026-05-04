import { getSupabaseServerClient } from '@/lib/supabase/server'

export async function rpc<T>(
  fn: string,
  params: Record<string, unknown>
): Promise<T> {
  const supabase = await getSupabaseServerClient()

  const { data, error } = await supabase.rpc(fn as never, params)

  if (error) {
    throw new Error(`[RPC:${fn}] ${error.message}`)
  }

  return data as T
}

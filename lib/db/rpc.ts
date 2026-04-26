import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function rpc<T>(
  fn: string,
  params: Record<string, any>
): Promise<T> {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.rpc(fn as any, params)

  if (error) {
    throw new Error(`[RPC:${fn}] ${error.message}`)
  }

  return data as T
}

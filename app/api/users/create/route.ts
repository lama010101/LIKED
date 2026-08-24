import { rpc } from '@/lib/db/rpc'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { displayName } = await req.json()

  await rpc('create_user_profile', {
    p_user_id: user.id,
    p_display_name: displayName,
    p_language_code: 'en',
  })

  return Response.json({ ok: true })
}

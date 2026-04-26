import { rpc } from '@/lib/db/rpc'

export async function POST(req: Request) {
  const { userId, displayName } = await req.json()

  await rpc('create_user_profile', {
    p_user_id: userId,
    p_display_name: displayName,
    p_language_code: 'en',
  })

  return Response.json({ ok: true })
}

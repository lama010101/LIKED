import { NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { rpc } from '@/lib/db/rpc'

export async function POST(req: Request) {
  try {
    const supabase = await getSupabaseServerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let body: { userId?: string; displayName?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const userId = body.userId?.trim()
    const displayName = body.displayName?.trim()
    if (!userId || !displayName) {
      return NextResponse.json({ error: 'userId and displayName are required' }, { status: 400 })
    }
    if (userId !== user.id) {
      return NextResponse.json({ error: 'userId must match the authenticated user' }, { status: 403 })
    }
    if (displayName.length > 100) {
      return NextResponse.json({ error: 'displayName must be 100 characters or less' }, { status: 400 })
    }

    await rpc('create_user_profile', {
      p_user_id: userId,
      p_display_name: displayName,
      p_language_code: 'en',
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create user profile'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['design_head', 'design', 'admin', 'merchandising_head', 'merchandising'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { title, remarks } = await request.json()
  if (!title?.trim()) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  // Insert via the service client — the nd_insert RLS policy doesn't include the
  // merchandising roles on every environment. Role is already checked above.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: development, error } = await (adminSupabase as any)
    .from('new_developments')
    .insert({ title: title.trim(), remarks: remarks || null, created_by: user.id, status: 'draft' })
    .select('id, title, remarks, status, sent_at, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ development })
}

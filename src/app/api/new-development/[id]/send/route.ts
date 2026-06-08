import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: dev } = await (supabase as any)
    .from('new_developments')
    .select('id, title, created_by, status')
    .eq('id', id)
    .single()

  if (!dev) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (dev.created_by !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (dev.status === 'sent') return NextResponse.json({ error: 'Already sent' }, { status: 400 })

  const { error } = await (supabase as any)
    .from('new_developments')
    .update({ status: 'sent', sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: sender } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()

  fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/notify-new-development`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      development_id:   id,
      development_title: dev.title,
      sender_name:      sender?.full_name || 'Design Team',
    }),
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}

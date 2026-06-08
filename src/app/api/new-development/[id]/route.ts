import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: dev } = await (supabase as any)
    .from('new_developments')
    .select('created_by, status')
    .eq('id', id)
    .single()

  if (!dev) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (dev.created_by !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (dev.status !== 'draft') return NextResponse.json({ error: 'Cannot delete a sent development' }, { status: 400 })

  const { error } = await (supabase as any).from('new_developments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

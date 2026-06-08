import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  if (!profile || !['merchandising_head', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { remarks } = await request.json()

  const { data: dev } = await (supabase as any)
    .from('new_developments')
    .select(`
      id, title, remarks, purchase_status,
      creator:profiles!created_by(full_name),
      files:new_development_files(id, name, file_url, file_type, file_size, category)
    `)
    .eq('id', id)
    .single()

  if (!dev) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (dev.purchase_status === 'sent') return NextResponse.json({ error: 'Already sent to purchase' }, { status: 400 })

  const now = new Date().toISOString()
  const { error } = await (supabase as any)
    .from('new_developments')
    .update({
      purchase_status:  'sent',
      purchase_sent_at: now,
      purchase_sent_by: user.id,
      purchase_remarks: remarks?.trim() || null,
      updated_at:       now,
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const creator = Array.isArray(dev.creator) ? dev.creator[0] : dev.creator

  fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/notify-new-development-purchase`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      development_id:      id,
      development_title:   dev.title,
      design_remarks:      dev.remarks,
      purchase_remarks:    remarks?.trim() || null,
      merch_sender_name:   profile.full_name,
      design_sender_name:  creator?.full_name || 'Design Team',
      files:               dev.files || [],
    }),
  }).catch(() => {})

  return NextResponse.json({ ok: true, purchase_sent_at: now })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// This route receives pre-parsed JSON from the browser.
// The browser handles: Excel parsing, image extraction, Supabase Storage uploads.
// This route only handles: DB field updates + activity log.

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!['admin', 'merchandising'].includes(profile?.role)) {
    return NextResponse.json({ error: 'Only merchandising team can upload' }, { status: 403 })
  }

  const body = await req.json()
  const { product_id, merch_fields, colour_variants, designer_name, sample_color, summary } = body

  if (!product_id) return NextResponse.json({ error: 'Missing product_id' }, { status: 400 })

  const updates: PromiseLike<unknown>[] = []
  const fields_updated: string[] = []

  if (merch_fields) {
    updates.push(
      supabase.from('merchandising_data').update({
        ...merch_fields,
        colour_variants: colour_variants || [],
        updated_by: user.id,
      }).eq('product_id', product_id)
    )
    fields_updated.push('dimensions', 'compartments', 'materials', 'weight', 'colour_variants')
  }

  if (designer_name) {
    updates.push(
      supabase.from('design_data').update({
        designer_name, sample_color, updated_by: user.id,
      }).eq('product_id', product_id)
    )
    fields_updated.push('designer_name', 'sample_color')
  }

  await Promise.all(updates)

  await supabase.from('activity_logs').insert({
    product_id,
    user_id: user.id,
    action: summary || `uploaded merchandising Excel`,
    department: 'merchandising',
  })

  return NextResponse.json({ success: true, fields_updated })
}

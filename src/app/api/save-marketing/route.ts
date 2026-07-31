import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { ownsStage, type UserRole } from '@/lib/types'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Save the Marketing tab.
//
// The browser used to write marketing_data directly and ignore the result, so a
// row RLS refused looked identical to a successful save — the tab flashed
// "Saved" and nothing changed. Writing here with the service client means the
// permission decision is this route's role check, and a failure is reported.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  const role = (profile?.role ?? '') as UserRole
  if (role !== 'admin' && !ownsStage(role, 'marketing_ready')) {
    return NextResponse.json({ error: 'Only the marketing team can edit this' }, { status: 403 })
  }

  const { product_id, fields, mark_complete } = await req.json() as {
    product_id: string
    fields: Record<string, unknown>
    mark_complete?: boolean
  }
  if (!product_id) return NextResponse.json({ error: 'Missing product_id' }, { status: 400 })

  // Whitelist: the request must not be able to set is_locked or reach other columns.
  const ALLOWED = [
    'product_features', 'photoshoots', 'hero_product',
    'catalogs', 'launch_creatives', 'social_links',
  ] as const
  const update: Record<string, unknown> = { updated_by: user.id }
  for (const key of ALLOWED) {
    if (fields && key in fields) update[key] = fields[key]
  }

  const { data: existing } = await adminSupabase
    .from('marketing_data').select('is_locked, is_completed').eq('product_id', product_id).single()
  if (existing?.is_locked) {
    return NextResponse.json({ error: 'Marketing data is locked' }, { status: 403 })
  }

  const becomingComplete = mark_complete === true && !existing?.is_completed
  if (mark_complete !== undefined) update.is_completed = !existing?.is_completed

  const { error } = await adminSupabase
    .from('marketing_data').update(update).eq('product_id', product_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await adminSupabase.from('activity_logs').insert({
    product_id,
    user_id: user.id,
    department: 'marketing',
    action: mark_complete === undefined
      ? 'updated marketing data'
      : becomingComplete ? 'marked marketing complete' : 'marked marketing as incomplete',
  })

  // Marketing is the end of the pipeline: completing it finishes the product
  // rather than advancing to Sales Pricing. The stage stays at marketing_ready
  // and is_completed is what marks the lifecycle done.
  const completed = becomingComplete
  return NextResponse.json({ ok: true, completed })
}

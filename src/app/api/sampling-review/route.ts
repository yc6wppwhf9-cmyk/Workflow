import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const adminSupabase = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'management'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Only management can review samples' }, { status: 403 })
  }

  const { product_id, status, feedback } = await req.json()
  if (!product_id || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { error } = await adminSupabase.from('sampling_data').update({
    sample_review_status: status,
    designer_feedback: status === 'rejected' ? (feedback || null) : null,
    reviewed_by: user.id,
    reviewed_at: new Date().toISOString(),
    is_completed: status === 'approved',
    updated_by: user.id,
  }).eq('product_id', product_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await adminSupabase.from('activity_logs').insert({
    product_id,
    user_id: user.id,
    action: status === 'approved'
      ? 'management approved sample — awaiting merchandising head to advance stage'
      : `management rejected sample${feedback ? `: ${feedback}` : ''}`,
    department: 'sampling',
  })

  return NextResponse.json({ success: true })
}

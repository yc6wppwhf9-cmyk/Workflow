import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Hand merchandising off to BOM in one server-side step.
// Done with the service client so it can't be silently blocked by RLS or by the
// advance_product_stage RPC refusing a non-sequential jump — the previous
// client-side version ignored those errors, leaving the product stuck.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()
  if (!['admin', 'merchandising_head'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Only the merchandising head can submit to BOM' }, { status: 403 })
  }

  const { product_id } = await req.json() as { product_id: string }
  if (!product_id) return NextResponse.json({ error: 'Missing product_id' }, { status: 400 })

  // Mark merchandising complete
  const { error: mdErr } = await adminSupabase
    .from('merchandising_data')
    .update({ is_completed: true, updated_by: user.id })
    .eq('product_id', product_id)
  if (mdErr) return NextResponse.json({ error: `merchandising_data: ${mdErr.message}` }, { status: 500 })

  // Advance the product to the BOM stage
  const { error: stageErr } = await adminSupabase
    .from('products')
    .update({ workflow_stage: 'bom_finalized', updated_by: user.id })
    .eq('id', product_id)
  if (stageErr) return NextResponse.json({ error: `stage: ${stageErr.message}` }, { status: 500 })

  await adminSupabase.from('activity_logs').insert({
    product_id,
    user_id: user.id,
    action: `${profile?.full_name || 'Merchandising'} submitted merchandising to BOM`,
    department: 'merchandising',
  })

  return NextResponse.json({ ok: true })
}

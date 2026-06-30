import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Records the "Costing approved by MD" checkbox on a product (Tejashree / admin).
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    if (!['admin', 'bom'].includes(profile?.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { product_id, approved } = await request.json() as { product_id: string; approved: boolean }
    if (!product_id) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    const { error } = await adminSupabase
      .from('products')
      .update({ md_costing_approved: !!approved, updated_by: user.id })
      .eq('id', product_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await adminSupabase.from('activity_logs').insert({
      product_id,
      user_id: user.id,
      action: approved ? 'marked MD costing approved' : 'cleared MD costing approval',
      department: 'bom',
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[set-md-costing]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

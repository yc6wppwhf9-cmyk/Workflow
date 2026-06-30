import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Naam Karan (rangewise naming): set a product's Range, then auto-generate its
// name as "<Range> NN" where NN is the next sequence number within that range.
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()

    if (!['admin', 'bom', 'marketing', 'marketing_head'].includes(profile?.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { product_id, range } = await request.json() as { product_id: string; range: string }
    const trimmedRange = range?.trim()
    if (!product_id || !trimmedRange) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    // Next sequence within this range = how many other products already use it + 1.
    const { data: existing } = await adminSupabase
      .from('products')
      .select('id')
      .eq('product_range', trimmedRange)
      .neq('id', product_id)

    const seq = (existing?.length ?? 0) + 1
    const name = `${trimmedRange} ${String(seq).padStart(2, '0')}`

    const { error } = await adminSupabase
      .from('products')
      .update({ product_range: trimmedRange, name, updated_by: user.id })
      .eq('id', product_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await adminSupabase.from('activity_logs').insert({
      product_id,
      user_id: user.id,
      action: `named product (range "${trimmedRange}") as "${name}"`,
      department: 'bom',
    })

    return NextResponse.json({ ok: true, name })
  } catch (err) {
    console.error('[set-product-range]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

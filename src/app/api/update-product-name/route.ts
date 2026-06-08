import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!['admin', 'marketing', 'marketing_head'].includes(profile?.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { product_id, name } = await request.json() as { product_id: string; name: string }
    if (!product_id || !name?.trim()) {
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const { error } = await adminSupabase
      .from('products')
      .update({ name: name.trim(), updated_by: user.id })
      .eq('id', product_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await adminSupabase.from('activity_logs').insert({
      product_id,
      user_id: user.id,
      action: `marketing renamed product to "${name.trim()}"`,
      department: 'marketing',
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[update-product-name]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

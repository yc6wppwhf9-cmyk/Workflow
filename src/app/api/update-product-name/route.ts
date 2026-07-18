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

    const { product_id, name, display_name } = await request.json() as {
      product_id: string; name?: string; display_name?: string
    }
    if (!product_id) return NextResponse.json({ error: 'Missing product_id' }, { status: 400 })

    const wantsName    = typeof name === 'string' && name.trim().length > 0
    const wantsDisplay = display_name !== undefined

    // Renaming the actual product name is restricted (it drives naming/rangewise);
    // the short-name alias is cosmetic and open to any signed-in user.
    if (wantsName && !['admin', 'marketing', 'marketing_head', 'bom'].includes(profile?.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Direct browser writes to products are blocked by RLS, so both the product
    // name and the short-name alias are updated here with the service client.
    const update: Record<string, unknown> = { updated_by: user.id }
    const actions: string[] = []
    if (wantsName) {
      update.name = name!.trim()
      actions.push(`renamed product to "${name!.trim()}"`)
    }
    if (wantsDisplay) {
      const dn = (display_name ?? '').trim()
      update.display_name = dn || null
      actions.push(dn ? `set short name to "${dn}"` : 'cleared short name')
    }
    if (actions.length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

    const { error } = await adminSupabase
      .from('products')
      .update(update)
      .eq('id', product_id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await adminSupabase.from('activity_logs').insert({
      product_id,
      user_id: user.id,
      action: actions.join('; '),
      department: profile?.role ?? 'admin',
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[update-product-name]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

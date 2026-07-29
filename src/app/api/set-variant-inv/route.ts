import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Save the finished-goods INV code for ONE design (colour variant).
// Each colourway is a separate SKU in the ERP, so the code lives per variant
// rather than once per product. Written with the service client because the
// BOM roles don't own merchandising_data under RLS.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'bom', 'bom_head', 'merchandising_head'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { product_id, style_name, fg_inv_code } = await req.json() as {
    product_id: string; style_name: string; fg_inv_code: string
  }
  if (!product_id || !style_name) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data: md } = await adminSupabase
    .from('merchandising_data').select('colour_variants').eq('product_id', product_id).single()

  const key = (s?: string | null) => String(s || '').toLowerCase().trim()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variants: any[] = (md?.colour_variants as any[]) || []
  let found = false
  const next = variants.map(v => {
    if (key(v.styleName) === key(style_name) || key(v.colourTag) === key(style_name)) {
      found = true
      return { ...v, fgInvCode: (fg_inv_code || '').trim() }
    }
    return v
  })
  if (!found) return NextResponse.json({ error: 'Design not found' }, { status: 404 })

  const { error } = await adminSupabase
    .from('merchandising_data')
    .update({ colour_variants: next, updated_by: user.id })
    .eq('product_id', product_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await adminSupabase.from('activity_logs').insert({
    product_id,
    user_id: user.id,
    department: 'bom',
    action: `set FG INV code for "${style_name}": ${(fg_inv_code || '').trim() || '(cleared)'}`,
  })

  return NextResponse.json({ ok: true })
}

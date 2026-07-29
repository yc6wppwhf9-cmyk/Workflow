import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Remove a colour variant entry from merchandising_data.colour_variants.
// Used to clear bogus variants imported from blank template columns without
// having to re-upload the sheet. Admin / merchandising head only.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'merchandising_head'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { product_id, style_name, colour_tag } = await req.json() as {
    product_id: string; style_name?: string; colour_tag?: string
  }
  if (!product_id || (!style_name && !colour_tag)) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data: md } = await adminSupabase
    .from('merchandising_data').select('colour_variants').eq('product_id', product_id).single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variants: any[] = (md?.colour_variants as any[]) || []
  const key = (s?: string | null) => String(s || '').toLowerCase().trim()
  const target = key(style_name) || key(colour_tag)
  const next = variants.filter(v => key(v.styleName) !== target && key(v.colourTag) !== target)

  const { error } = await adminSupabase
    .from('merchandising_data')
    .update({ colour_variants: next, updated_by: user.id })
    .eq('product_id', product_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, removed: variants.length - next.length })
}

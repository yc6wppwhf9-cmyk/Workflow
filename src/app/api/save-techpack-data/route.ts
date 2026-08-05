import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Saves parsed tech pack data (PDF url or Excel variants) to design_data.
//
// The design_data row for a product isn't always pre-created, so the browser's
// upsert(onConflict: 'product_id') can fall through to an INSERT. There's no
// RLS INSERT policy on design_data for a row that doesn't exist yet, so that
// insert was rejected with "new row violates row-level security policy" —
// admin client bypasses RLS the same way notify-design-remark does for updates.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['design', 'design_head', 'admin'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { product_id, techpack_pdf_url, variants } = await req.json() as {
    product_id?: string; techpack_pdf_url?: string; variants?: unknown
  }
  if (!product_id) return NextResponse.json({ error: 'Missing product_id' }, { status: 400 })
  if (techpack_pdf_url === undefined && variants === undefined) {
    return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })
  }

  const updates: Record<string, unknown> = { product_id, updated_by: user.id }
  if (techpack_pdf_url !== undefined) updates.techpack_pdf_url = techpack_pdf_url
  if (variants !== undefined) updates.variants = variants

  const { error } = await adminSupabase
    .from('design_data')
    .upsert(updates, { onConflict: 'product_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

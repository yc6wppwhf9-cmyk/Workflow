import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || !['design_head', 'admin'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const productId = request.nextUrl.searchParams.get('product_id')
  if (!productId) return NextResponse.json({ error: 'Missing product_id' }, { status: 400 })

  // Delete in dependency order (in case DB lacks full CASCADE)
  await Promise.allSettled([
    adminSupabase.from('activity_logs').delete().eq('product_id', productId),
    adminSupabase.from('design_submissions').delete().eq('product_id', productId),
    adminSupabase.from('notifications').delete().eq('product_id', productId),
  ])

  await Promise.allSettled([
    adminSupabase.from('product_files').delete().eq('product_id', productId),
    adminSupabase.from('design_data').delete().eq('product_id', productId),
    adminSupabase.from('sampling_data').delete().eq('product_id', productId),
    adminSupabase.from('merchandising_data').delete().eq('product_id', productId),
    adminSupabase.from('bom_data').delete().eq('product_id', productId),
    adminSupabase.from('marketing_data').delete().eq('product_id', productId),
    adminSupabase.from('sales_data').delete().eq('product_id', productId),
  ])

  const { error } = await adminSupabase.from('products').delete().eq('id', productId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Correct an item's name in item_master (the ERP component master).
// Used when the merchandising Excel and the master disagree — the BOM team can
// fix the master rather than living with a wrong name on every future import.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'bom', 'bom_head'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Only the BOM team can edit the item master' }, { status: 403 })
  }

  const { inv_code, item_name, product_id } = await req.json() as {
    inv_code: string; item_name: string; product_id?: string
  }
  if (!inv_code || !item_name?.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const name = item_name.trim()
  const { error } = await adminSupabase
    .from('item_master')
    .update({ item_name: name, item_name_norm: name.toLowerCase().replace(/\s+/g, ' ') })
    .eq('inv_code', inv_code)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (product_id) {
    await adminSupabase.from('activity_logs').insert({
      product_id,
      user_id: user.id,
      department: 'bom',
      action: `renamed item master ${inv_code} to "${name}"`,
    })
  }

  return NextResponse.json({ ok: true })
}

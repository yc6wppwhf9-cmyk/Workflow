import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { matchConsumptionToBom } from '@/lib/parse-cutting-sheet'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'merchandising'].includes(profile?.role)) {
    return NextResponse.json({ error: 'Only merchandising team can upload cutting sheets' }, { status: 403 })
  }

  const { product_id, cutting_items } = await req.json()
  if (!product_id || !cutting_items?.length) {
    return NextResponse.json({ error: 'Missing product_id or cutting_items' }, { status: 400 })
  }

  // Fetch current BOM items
  const { data: bomData } = await supabase
    .from('bom_data')
    .select('items')
    .eq('product_id', product_id)
    .single()

  const currentItems: Array<{ inv_name: string; inv_code: string; consumption: string; unit: string }> =
    (bomData?.items as Array<{ inv_name: string; inv_code: string; consumption: string; unit: string }>) || []

  if (currentItems.length === 0) {
    return NextResponse.json({ error: 'No BOM items found. Upload the merchandising Excel first.' }, { status: 400 })
  }

  // Match consumption values to BOM items
  const updatedItems = matchConsumptionToBom(currentItems, cutting_items)
  const matched = updatedItems.filter((item, i) => item.consumption !== currentItems[i].consumption).length

  await supabase.from('bom_data').update({ items: updatedItems, updated_by: user.id }).eq('product_id', product_id)

  await supabase.from('activity_logs').insert({
    product_id,
    user_id: user.id,
    action: `uploaded cutting sheet — consumption filled for ${matched} of ${currentItems.length} BOM items`,
    department: 'merchandising',
  })

  return NextResponse.json({ success: true, matched, total: currentItems.length })
}

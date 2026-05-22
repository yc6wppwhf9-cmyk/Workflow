import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { matchConsumptionToBom } from '@/lib/parse-cutting-sheet'

// This route receives pre-parsed JSON from the browser.
// The browser handles: Excel parsing, image extraction, Supabase Storage uploads.
// This route only handles: DB field updates + activity log.

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!['admin', 'merchandising'].includes(profile?.role)) {
    return NextResponse.json({ error: 'Only merchandising team can upload' }, { status: 403 })
  }

  const body = await req.json()
  const { product_id, merch_fields, colour_variants, designer_name, sample_color, summary, cutting_items, extracted_product_name } = body

  if (!product_id) return NextResponse.json({ error: 'Missing product_id' }, { status: 400 })

  // Check if attribute data already exists (determines Attribute vs Production version)
  const { data: existingMerch } = await supabase
    .from('merchandising_data')
    .select('weight')
    .eq('product_id', product_id)
    .single()

  const isReupload = !!existingMerch?.weight
  const version_saved: 'attribute' | 'production' = isReupload ? 'production' : 'attribute'

  const updates: PromiseLike<unknown>[] = []
  const fields_updated: string[] = []

  if (merch_fields) {
    if (isReupload) {
      // Save revised data as production version, keep attribute untouched
      updates.push(
        supabase.from('merchandising_data').update({
          production_fields: { ...merch_fields, colour_variants: colour_variants || [] },
          updated_by: user.id,
        }).eq('product_id', product_id)
      )
      fields_updated.push('production_fields')
    } else {
      // First upload — save as attribute version
      updates.push(
        supabase.from('merchandising_data').update({
          ...merch_fields,
          colour_variants: colour_variants || [],
          updated_by: user.id,
        }).eq('product_id', product_id)
      )
      fields_updated.push('dimensions', 'compartments', 'materials', 'weight', 'colour_variants')
    }
  }

  // Update product name from Excel style names (first upload only, or if name looks like a SKU placeholder)
  if (extracted_product_name && !isReupload) {
    updates.push(
      supabase.from('products').update({ name: extracted_product_name, updated_by: user.id }).eq('id', product_id)
    )
    fields_updated.push('product_name')
  }

  // Pre-populate BOM tab from the primary colour variant's INV items (attribute upload only)
  if (!isReupload) {
    const primaryVariantBom = colour_variants?.[0]?.bomItems
    if (primaryVariantBom?.length > 0) {
      // Look up INV codes from item_master by normalised item name
      const rawNames: string[] = primaryVariantBom.map((item: { inv_name: string }) => item.inv_name)
      const normNames = rawNames.map(n => n.trim().toLowerCase().replace(/\s+/g, ' '))
      const { data: masterRows } = await supabase
        .from('item_master')
        .select('inv_code, item_name_norm, uom')
        .in('item_name_norm', normNames)
      const masterMap = new Map<string, { inv_code: string; uom: string }>()
      for (const row of masterRows ?? []) {
        masterMap.set(row.item_name_norm, { inv_code: row.inv_code, uom: row.uom })
      }

      let bomItems = primaryVariantBom.map((item: { inv_name: string; inv_code: string }, idx: number) => {
        const master = masterMap.get(normNames[idx])
        return {
          inv_name: item.inv_name,
          inv_code: master?.inv_code ?? item.inv_code,
          consumption: '',
          unit: master?.uom ?? '',
        }
      })
      if (cutting_items?.length > 0) {
        bomItems = matchConsumptionToBom(bomItems, cutting_items)
      }
      updates.push(
        supabase.from('bom_data').update({ items: bomItems, updated_by: user.id }).eq('product_id', product_id)
      )
      fields_updated.push('bom_items')
    }
  }

  if (designer_name) {
    updates.push(
      supabase.from('design_data').update({
        designer_name, sample_color, updated_by: user.id,
      }).eq('product_id', product_id)
    )
    fields_updated.push('designer_name', 'sample_color')
  }

  await Promise.all(updates)

  await supabase.from('activity_logs').insert({
    product_id,
    user_id: user.id,
    action: summary || `uploaded merchandising Excel (${version_saved})`,
    department: 'merchandising',
  })

  return NextResponse.json({ success: true, fields_updated, version_saved })
}

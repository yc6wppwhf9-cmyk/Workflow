import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { matchConsumptionToBom } from '@/lib/parse-cutting-sheet'

// This route receives pre-parsed JSON from the browser.
// The browser handles: Excel parsing, image extraction, Supabase Storage uploads.
// This route only handles: DB field updates + activity log.

// Admin client bypasses RLS for cross-department writes (e.g. merch upload pre-filling bom_data)
const adminSupabase = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || !['admin', 'merchandising', 'merchandising_head'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only merchandising team can upload' }, { status: 403 })
  }

  const body = await req.json()
  const { product_id, merch_fields, colour_variants, bom_items, designer_name, sample_color, summary, cutting_items, extracted_product_name } = body

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

  // Enrich BOM items from item_master.
  // Items coming from the MAPPING sheet already have inv_code but no inv_name.
  // Items from the INV SHEET have inv_name but may lack inv_code.
  // Strategy: look up by inv_code first (MAPPING case), fall back to name lookup.
  let enrichedVariants = colour_variants || []
  if (enrichedVariants.length > 0) {
    const allInvCodes: string[] = []
    const allNames: string[] = []
    for (const v of enrichedVariants) {
      for (const item of v.bomItems || []) {
        if (item.inv_code) allInvCodes.push(item.inv_code)
        if (item.inv_name) allNames.push(item.inv_name)
      }
    }

    // Fetch by inv_code (covers MAPPING sheet rows) + by name (covers INV SHEET rows)
    const uniqueCodes = [...new Set(allInvCodes)]
    const uniqueNorms = [...new Set(allNames.map(n => n.trim().toLowerCase().replace(/\s+/g, ' ')))]
    const [{ data: byCode }, { data: byName }] = await Promise.all([
      uniqueCodes.length > 0
        ? supabase.from('item_master').select('inv_code, item_name, item_name_norm, uom').in('inv_code', uniqueCodes)
        : Promise.resolve({ data: [] }),
      uniqueNorms.length > 0
        ? supabase.from('item_master').select('inv_code, item_name, item_name_norm, uom').in('item_name_norm', uniqueNorms)
        : Promise.resolve({ data: [] }),
    ])

    // Build lookup maps
    const codeMap = new Map<string, { inv_name: string; uom: string }>()
    for (const row of byCode ?? []) codeMap.set(row.inv_code, { inv_name: row.item_name ?? '', uom: row.uom ?? '' })
    const nameMap = new Map<string, { inv_code: string; uom: string }>()
    for (const row of byName ?? []) nameMap.set(row.item_name_norm, { inv_code: row.inv_code, uom: row.uom ?? '' })

    enrichedVariants = enrichedVariants.map((v: { bomItems?: { inv_name: string; inv_code: string; consumption: string; unit: string }[] }) => ({
      ...v,
      bomItems: (v.bomItems || []).map((item: { inv_name: string; inv_code: string; consumption: string; unit: string }) => {
        if (item.inv_code && codeMap.has(item.inv_code)) {
          // MAPPING sheet path: have inv_code, need name + unit from master
          const master = codeMap.get(item.inv_code)!
          return { ...item, inv_name: master.inv_name || item.inv_name, unit: master.uom || item.unit }
        }
        if (item.inv_name) {
          // INV SHEET path: have name, need inv_code + unit from master
          const norm = item.inv_name.trim().toLowerCase().replace(/\s+/g, ' ')
          const master = nameMap.get(norm)
          return { ...item, inv_code: master?.inv_code ?? item.inv_code, unit: master?.uom ?? item.unit }
        }
        return item
      }),
    }))
  }

  if (merch_fields) {
    if (isReupload) {
      // Save revised data as production version, keep attribute untouched
      updates.push(
        supabase.from('merchandising_data').update({
          production_fields: { ...merch_fields, colour_variants: enrichedVariants },
          updated_by: user.id,
        }).eq('product_id', product_id)
      )
      fields_updated.push('production_fields')
    } else {
      // First upload — save as attribute version
      updates.push(
        supabase.from('merchandising_data').update({
          ...merch_fields,
          colour_variants: enrichedVariants,
          updated_by: user.id,
        }).eq('product_id', product_id)
      )
      fields_updated.push('dimensions', 'compartments', 'materials', 'weight', 'colour_variants')
    }
  } else if (enrichedVariants.length > 0 && !isReupload) {
    // No SKU fields matched, but we still have colour variants — save them separately
    updates.push(
      supabase.from('merchandising_data').update({
        colour_variants: enrichedVariants,
        updated_by: user.id,
      }).eq('product_id', product_id)
    )
    fields_updated.push('colour_variants')
  }

  // Always update product name + display_name from Excel (every upload)
  if (extracted_product_name) {
    updates.push(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('products').update({ name: extracted_product_name, display_name: extracted_product_name, updated_by: user.id }).eq('id', product_id)
    )
    fields_updated.push('product_name')
  }

  // Pre-populate BOM tab (attribute upload only)
  // Use first colour variant's BOM if available, otherwise fall back to the directly parsed bom_items
  if (!isReupload) {
    const primaryVariantBom = colour_variants?.[0]?.bomItems
    const rawBomSource: { inv_name: string; inv_code: string; consumption?: string }[] =
      primaryVariantBom?.length > 0 ? primaryVariantBom : (bom_items ?? [])

    if (rawBomSource.length > 0) {
      const rawNames: string[] = rawBomSource.map((item) => item.inv_name)
      const normNames = rawNames.map(n => n.trim().toLowerCase().replace(/\s+/g, ' '))
      const { data: masterRows } = await supabase
        .from('item_master')
        .select('inv_code, item_name_norm, uom')
        .in('item_name_norm', normNames)
      const masterMap = new Map<string, { inv_code: string; uom: string }>()
      for (const row of masterRows ?? []) {
        masterMap.set(row.item_name_norm, { inv_code: row.inv_code, uom: row.uom ?? '' })
      }

      let bomRows = rawBomSource.map((item, idx) => {
        const master = masterMap.get(normNames[idx])
        return {
          inv_name: item.inv_name,
          inv_code: master?.inv_code ?? item.inv_code,
          consumption: item.consumption ?? '',
          unit: master?.uom ?? '',
        }
      })
      if (cutting_items?.length > 0) {
        bomRows = matchConsumptionToBom(bomRows, cutting_items)
      }
      updates.push(
        adminSupabase.from('bom_data').update({ items: bomRows, updated_by: user.id }).eq('product_id', product_id)
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

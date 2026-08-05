import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { matchConsumptionToBom } from '@/lib/parse-cutting-sheet'
import { isPlaceholderVariant } from '@/lib/types'
import { canAutoRename } from '@/lib/product-naming'

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
          // MAPPING sheet path: have inv_code, need name + unit from master.
          // Keep the Excel's own name when it disagrees with the master so the
          // conflict can be flagged rather than silently overwritten.
          const master = codeMap.get(item.inv_code)!
          const norm = (s: string) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
          const differs = !!master.inv_name && !!item.inv_name && norm(master.inv_name) !== norm(item.inv_name)
          return {
            ...item,
            inv_name: master.inv_name || item.inv_name,
            unit: master.uom || item.unit,
            ...(differs ? { excel_name: item.inv_name } : {}),
          }
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

  // Merge the uploaded variants into the stored colour_variants, keyed by the
  // UNIQUE style name. Teams upload several sheets for one product (and two
  // designs can share a colour), so every upload must add/update its own designs
  // rather than replace the set — previously a re-upload only wrote
  // production_fields, so later sheets never showed up.
  let mergedVariants: typeof enrichedVariants = enrichedVariants
  if (enrichedVariants.length > 0) {
    const { data: existingMD } = await adminSupabase
      .from('merchandising_data').select('colour_variants').eq('product_id', product_id).single()
    // Drop previously-imported placeholder/label variants (e.g. "POCKET
    // COMPARTMENT" from a blank template column) so a re-upload cleans them out
    // instead of preserving them forever.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing: any[] = ((existingMD?.colour_variants as any[]) || [])
      .filter(v => !isPlaceholderVariant(v))
    const keyOf = (v: { styleName?: string; colourTag?: string }) =>
      String(v.styleName || v.colourTag || '').toLowerCase().trim()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const incoming = new Map<string, any>(enrichedVariants.map((v: any) => [keyOf(v), v]))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mergedVariants = existing.map((v: any) => incoming.get(keyOf(v)) ?? v)
    for (const [k, v] of incoming) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (!existing.some((e: any) => keyOf(e) === k)) mergedVariants.push(v)
    }
  }

  if (merch_fields) {
    if (isReupload) {
      // Keep the original attribute snapshot, store revised specs as the
      // production version — but still merge the variant list.
      updates.push(
        supabase.from('merchandising_data').update({
          production_fields: { ...merch_fields, colour_variants: enrichedVariants },
          ...(mergedVariants.length > 0 ? { colour_variants: mergedVariants } : {}),
          updated_by: user.id,
        }).eq('product_id', product_id)
      )
      fields_updated.push('production_fields', 'colour_variants')
    } else {
      // First upload — save as attribute version
      updates.push(
        supabase.from('merchandising_data').update({
          ...merch_fields,
          colour_variants: mergedVariants,
          updated_by: user.id,
        }).eq('product_id', product_id)
      )
      fields_updated.push('dimensions', 'compartments', 'materials', 'weight', 'colour_variants')
    }
  } else if (mergedVariants.length > 0) {
    // No SKU fields matched, but we still have colour variants — save them separately
    updates.push(
      supabase.from('merchandising_data').update({
        colour_variants: mergedVariants,
        updated_by: user.id,
      }).eq('product_id', product_id)
    )
    fields_updated.push('colour_variants')
  }

  // Adopt the Excel's product name ONLY while nothing has deliberately named this
  // product. This used to run on every upload, so a name assigned at the Costing &
  // Naming gate was silently clobbered the next time merch re-uploaded a sheet.
  // A product carrying a product_range has been named on purpose — leave it alone.
  if (extracted_product_name) {
    const { data: current } = await adminSupabase
      .from('products').select('name, display_name, product_range').eq('id', product_id).single()

    const nameUpdate: Record<string, unknown> = { updated_by: user.id }
    if (current && canAutoRename(current)) {
      nameUpdate.name = extracted_product_name
      fields_updated.push('product_name')
    }
    // display_name is the cosmetic short-name alias — fill it when blank, but
    // never overwrite one somebody chose.
    if (current && !String(current.display_name ?? '').trim()) {
      nameUpdate.display_name = extracted_product_name
      fields_updated.push('display_name')
    }
    if (Object.keys(nameUpdate).length > 1) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updates.push((adminSupabase as any).from('products').update(nameUpdate).eq('id', product_id))
    }
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

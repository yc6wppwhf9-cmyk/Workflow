import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import AdmZip from 'adm-zip'
import { parseMerchExcel, skuToMerchFields, ParsedSKU } from '@/lib/parse-merch-excel'

// Admin client bypasses RLS for storage uploads
const adminSupabase = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function normalise(s: string) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

function skusMatchProduct(sku: ParsedSKU, productName: string) {
  const sn = normalise(sku.styleName)
  const pn = normalise(productName)
  return sn === pn || sn.startsWith(pn) || pn.startsWith(sn)
}

function aggregateSkus(skus: ParsedSKU[]) {
  const primary = skus[0]
  const merch = skuToMerchFields(primary)
  // Union materials across all color variants
  const allMaterials = [
    ...new Set(skus.flatMap(s => [s.mainMaterial, s.material].filter(Boolean))),
  ]
  merch.materials = allMaterials
  return merch
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!['admin', 'merchandising'].includes(profile?.role)) {
    return NextResponse.json({ error: 'Only merchandising team can upload' }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File
  const productId = formData.get('product_id') as string
  const productName = (formData.get('product_name') as string) || ''

  if (!file || !productId) {
    return NextResponse.json({ error: 'Missing file or product_id' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // ── 1. Parse structured data ────────────────────────────
  const parsed = parseMerchExcel(arrayBuffer)

  // Group SKUs by normalised style name
  const skuGroups = new Map<string, ParsedSKU[]>()
  for (const sku of parsed.skus) {
    const key = normalise(sku.styleName)
    if (!skuGroups.has(key)) skuGroups.set(key, [])
    skuGroups.get(key)!.push(sku)
  }

  // Find SKUs that belong to this product (handles color variants)
  let relevantSkus = parsed.skus
  const otherProductNames: string[] = []
  if (productName && skuGroups.size > 0) {
    const matched: ParsedSKU[] = []
    for (const [, group] of skuGroups) {
      if (skusMatchProduct(group[0], productName)) {
        matched.push(...group)
      } else {
        if (!otherProductNames.includes(group[0].styleName)) {
          otherProductNames.push(group[0].styleName)
        }
      }
    }
    if (matched.length > 0) relevantSkus = matched
  }

  const colors = [...new Set(relevantSkus.map(s => s.color).filter(Boolean))]

  const results = {
    skus_found: parsed.skus.length,
    skus_matched: relevantSkus.length,
    colors_found: colors,
    other_products_in_file: otherProductNames,
    bom_items_found: parsed.bomItems.length,
    images_uploaded: 0,
    fields_updated: [] as string[],
    errors: [] as string[],
  }

  // ── 2. Update merchandising_data (aggregate across color variants) ──
  if (relevantSkus.length > 0) {
    const merch = aggregateSkus(relevantSkus)

    const { error } = await supabase.from('merchandising_data').update({
      dimensions: merch.dimensions,
      compartments: merch.compartments,
      materials: merch.materials,
      weight: merch.weight,
      updated_by: user.id,
    }).eq('product_id', productId)

    if (error) results.errors.push('Merchandising update: ' + error.message)
    else results.fields_updated.push('dimensions', 'compartments', 'materials', 'weight')

    // Update design_data if we have designer name
    const primarySku = relevantSkus[0]
    if (primarySku.designerName) {
      await supabase.from('design_data').update({
        designer_name: primarySku.designerName,
        sample_color: colors.join(', '),
        updated_by: user.id,
      }).eq('product_id', productId)
      results.fields_updated.push('designer_name', 'sample_color')
    }
  }

  // ── 3. Update BOM data ──────────────────────────────────
  if (parsed.bomItems.length > 0) {
    const { error } = await supabase.from('bom_data').update({
      items: parsed.bomItems,
      updated_by: user.id,
    }).eq('product_id', productId)

    if (error) results.errors.push('BOM update: ' + error.message)
    else results.fields_updated.push('bom_items')
  }

  // ── 4. Extract & upload embedded images ─────────────────
  try {
    const zip = new AdmZip(buffer)
    const mediaEntries = zip.getEntries().filter(e =>
      e.entryName.startsWith('xl/media/') &&
      /\.(png|jpg|jpeg|gif|bmp|emf|wmf)$/i.test(e.entryName)
    )

    for (const entry of mediaEntries) {
      const imgBuffer = entry.getData()
      const ext = entry.entryName.split('.').pop()?.toLowerCase() || 'png'
      const imgName = entry.entryName.split('/').pop() || `image_${Date.now()}.${ext}`
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
      const storagePath = `${productId}/merch_${Date.now()}_${imgName}`

      const { error: uploadError } = await adminSupabase.storage
        .from('product-files')
        .upload(storagePath, imgBuffer, { contentType: mimeType, upsert: true })

      if (uploadError) {
        results.errors.push(`Image upload failed: ${imgName} — ${uploadError.message}`)
        continue
      }

      const { data: { publicUrl } } = adminSupabase.storage
        .from('product-files')
        .getPublicUrl(storagePath)

      await supabase.from('product_files').insert({
        product_id: productId,
        name: imgName,
        file_url: publicUrl,
        file_type: mimeType,
        file_size: imgBuffer.length,
        department: 'merchandising',
        uploaded_by: user.id,
      })

      results.images_uploaded++
    }
  } catch (e: unknown) {
    results.errors.push('Image extraction: ' + String(e))
  }

  // ── 5. Store original Excel as a file record ────────────
  const excelPath = `${productId}/merch_excel_${Date.now()}_${file.name}`
  const { error: excelUploadError } = await adminSupabase.storage
    .from('product-files')
    .upload(excelPath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    })

  if (!excelUploadError) {
    const { data: { publicUrl } } = adminSupabase.storage.from('product-files').getPublicUrl(excelPath)
    await supabase.from('product_files').insert({
      product_id: productId,
      name: file.name,
      file_url: publicUrl,
      file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      file_size: buffer.length,
      department: 'merchandising',
      uploaded_by: user.id,
    })
  }

  // ── 6. Log activity ─────────────────────────────────────
  await supabase.from('activity_logs').insert({
    product_id: productId,
    user_id: user.id,
    action: `uploaded merchandising Excel "${file.name}" — ${results.skus_matched} SKU variant(s) matched (${colors.join(', ')}), ${parsed.bomItems.length} BOM items, ${results.images_uploaded} images`,
    department: 'merchandising',
  })

  return NextResponse.json({ success: true, results })
}

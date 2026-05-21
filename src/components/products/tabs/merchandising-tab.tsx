'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Save, Plus, X, Upload, FileSpreadsheet, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { parseMerchExcel, filterSkusForProduct, aggregateMerchFields, buildColourVariants, extractColorTag } from '@/lib/parse-merch-excel'
import type { Product, Profile, MerchandisingData } from '@/lib/types'

interface MerchandisingTabProps {
  product: Product
  profile: Profile
  data: MerchandisingData | null
}

export function MerchandisingTab({ product, profile, data }: MerchandisingTabProps) {
  const router = useRouter()
  const canEdit = !data?.is_locked && ['admin', 'merchandising'].includes(profile.role)

  const [form, setForm] = useState({
    dimensions: data?.dimensions || { length: '', width: '', height: '', unit: 'cm' },
    compartments: data?.compartments || '',
    materials: data?.materials || [] as string[],
    volume: data?.volume || '',
    weight: data?.weight || '',
  })
  const [newMaterial, setNewMaterial] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Excel upload state
  const excelInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [uploadResult, setUploadResult] = useState<{
    skus_found: number
    skus_matched: number
    colors_found: string[]
    other_products_in_file: string[]
    bom_items_found: number
    images_uploaded: number
    fields_updated: string[]
    errors: string[]
  } | null>(null)

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()

    await supabase.from('merchandising_data').update({
      ...form,
      updated_by: profile.id,
    }).eq('product_id', product.id)

    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: 'updated merchandising data',
      department: 'merchandising',
    })

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
    router.refresh()
  }

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadResult(null)

    const errors: string[] = []
    let images_uploaded = 0

    try {
      // ── 1. Parse Excel in the browser (no server upload needed) ─────────────
      setUploadProgress('Parsing Excel...')
      const arrayBuffer = await file.arrayBuffer()
      const parsed = parseMerchExcel(arrayBuffer, product.name)

      const relevantSkus = filterSkusForProduct(parsed.skus, product.name)
      const otherProducts = parsed.skus
        .filter(s => !relevantSkus.includes(s))
        .map(s => s.styleName)
        .filter((v, i, a) => a.indexOf(v) === i)

      const colourVariants = buildColourVariants(relevantSkus, product.name)
      const colourTags = colourVariants.map(v => v.colourTag)
      const merch_fields = relevantSkus.length > 0 ? aggregateMerchFields(relevantSkus) : null
      const primarySku = relevantSkus[0]

      // ── 2. Extract images + colour mapping via JSZip ─────────────────────────
      setUploadProgress('Extracting images...')
      type ImgEntry = { name: string; bytes: Uint8Array; mimeType: string; colourTag: string | null }
      const imagesToUpload: ImgEntry[] = []

      try {
        const { default: JSZip } = await import('jszip')
        const zip = await JSZip.loadAsync(arrayBuffer)

        // Find drawing with the most images (DETAILS PICS sheet)
        let bestDrawing = ''
        let bestRels = ''
        let bestCount = 0
        for (let i = 1; i <= 10; i++) {
          const relsFile = zip.file(`xl/drawings/_rels/drawing${i}.xml.rels`)
          if (!relsFile) break
          const relsText = await relsFile.async('string')
          const count = (relsText.match(/Target="\.\.\/media\//g) || []).length
          if (count > bestCount) { bestCount = count; bestDrawing = `xl/drawings/drawing${i}.xml`; bestRels = `xl/drawings/_rels/drawing${i}.xml.rels` }
        }

        // Build rId → filename map
        const rIdToFile: Record<string, string> = {}
        if (bestRels) {
          const relsText = await zip.file(bestRels)!.async('string')
          for (const m of relsText.matchAll(/Id="(rId\d+)"[^>]*Target="\.\.\/media\/(image\d+\.\w+)"/g)) {
            rIdToFile[m[1]] = m[2]
          }
        }

        // Parse image row positions from drawing XML
        const imageColourMap = new Map<string, string>()
        if (bestDrawing) {
          const drawingText = await zip.file(bestDrawing)!.async('string')
          const anchors = [...drawingText.matchAll(/<xdr:twoCellAnchor[^>]*>([\s\S]*?)<\/xdr:twoCellAnchor>/g)]
          const positions: Array<{ row: number; file: string }> = []
          for (const anchor of anchors) {
            const rowMatch = anchor[1].match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)
            const rIdMatch = anchor[1].match(/r:embed="(rId\d+)"/)
            if (rowMatch && rIdMatch) {
              const f = rIdToFile[rIdMatch[1]]
              if (f) positions.push({ row: parseInt(rowMatch[1]), file: f })
            }
          }
          const uniqueRows = [...new Set(positions.map(p => p.row))].sort((a, b) => a - b)
          for (const pos of positions) {
            const idx = uniqueRows.indexOf(pos.row)
            if (idx < colourTags.length) imageColourMap.set(pos.file, colourTags[idx])
          }
        }

        // Collect relevant images (those in imageColourMap, or all if no map)
        const mediaFiles = Object.keys(zip.files).filter(p =>
          p.startsWith('xl/media/') && /\.(png|jpg|jpeg|gif|bmp)$/i.test(p)
        )
        const filesToUpload = imageColourMap.size > 0
          ? mediaFiles.filter(p => imageColourMap.has(p.split('/').pop() || ''))
          : mediaFiles

        for (const path of filesToUpload) {
          const bytes = await zip.file(path)!.async('uint8array')
          const name = path.split('/').pop()!
          const ext = name.split('.').pop()?.toLowerCase() || 'jpg'
          const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
          const colourTag = imageColourMap.get(name) || null
          imagesToUpload.push({ name, bytes, mimeType, colourTag })
        }
      } catch (imgErr) {
        errors.push('Image extraction failed: ' + String(imgErr))
      }

      // ── 3. Upload images browser → Supabase Storage ──────────────────────────
      const supabase = createClient()
      const ts = Date.now()
      const fileRecords: Array<{
        product_id: string; name: string; file_url: string; file_type: string
        file_size: number; department: string; uploaded_by: string; colour_tag: string | null
      }> = []

      for (let i = 0; i < imagesToUpload.length; i++) {
        const img = imagesToUpload[i]
        setUploadProgress(`Uploading images (${i + 1}/${imagesToUpload.length})...`)
        const storagePath = `${product.id}/merch_${ts}_${i}_${img.name}`
        const { error: uploadError } = await supabase.storage
          .from('product-files')
          .upload(storagePath, img.bytes, { contentType: img.mimeType, upsert: true })
        if (uploadError) { errors.push(`Image failed: ${img.name}`); continue }
        const { data: { publicUrl } } = supabase.storage.from('product-files').getPublicUrl(storagePath)
        fileRecords.push({
          product_id: product.id, name: img.name, file_url: publicUrl,
          file_type: img.mimeType, file_size: img.bytes.length,
          department: 'merchandising', uploaded_by: profile.id, colour_tag: img.colourTag,
        })
        images_uploaded++
      }

      // Upload the Excel file itself
      setUploadProgress('Saving records...')
      const excelPath = `${product.id}/merch_excel_${ts}_${file.name}`
      const { error: excelErr } = await supabase.storage.from('product-files')
        .upload(excelPath, arrayBuffer, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: true,
        })
      if (!excelErr) {
        const { data: { publicUrl } } = supabase.storage.from('product-files').getPublicUrl(excelPath)
        fileRecords.push({
          product_id: product.id, name: file.name, file_url: publicUrl,
          file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          file_size: file.size, department: 'merchandising', uploaded_by: profile.id, colour_tag: null,
        })
      }

      if (fileRecords.length > 0) {
        await supabase.from('product_files').insert(fileRecords)
      }

      // Update local form state immediately so the UI reflects extracted data
      if (merch_fields) {
        setForm({
          dimensions: merch_fields.dimensions || { length: '', width: '', height: '', unit: 'cm' },
          compartments: merch_fields.compartments || '',
          materials: merch_fields.materials || [],
          volume: merch_fields.volume || '',
          weight: merch_fields.weight || '',
        })
      }

      // ── 4. Send parsed data to server for DB updates ─────────────────────────
      setUploadProgress('Updating product data...')
      const colourSummary = colourTags.join(', ')
      await fetch('/api/upload-merch-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          merch_fields,
          bom_items: parsed.bomItems,
          colour_variants: colourVariants,
          designer_name: primarySku?.designerName || null,
          sample_color: colourTags.join(', ') || null,
          summary: `uploaded merchandising Excel "${file.name}" — ${relevantSkus.length} variant(s) matched (${colourSummary}), ${parsed.bomItems.length} BOM items, ${images_uploaded} images`,
        }),
      })

      setUploadResult({
        skus_found: parsed.skus.length,
        skus_matched: relevantSkus.length,
        colors_found: colourTags,
        other_products_in_file: otherProducts,
        bom_items_found: parsed.bomItems.length,
        images_uploaded,
        fields_updated: merch_fields ? ['dimensions', 'compartments', 'materials', 'weight', 'colour_variants'] : [],
        errors,
      })
    } catch (err) {
      setUploadResult({
        skus_found: 0, skus_matched: 0, colors_found: [], other_products_in_file: [],
        bom_items_found: 0, images_uploaded, fields_updated: [],
        errors: ['Unexpected error: ' + String(err)],
      })
    }

    setUploadProgress('')
    setUploading(false)
    if (excelInputRef.current) excelInputRef.current.value = ''
    router.refresh()
  }

  async function markComplete() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('merchandising_data').update({
      ...form,
      is_completed: !data?.is_completed,
      updated_by: profile.id,
    }).eq('product_id', product.id)
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="max-w-2xl space-y-4">

      {/* Excel Upload Card */}
      {canEdit && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-900">Upload Merchandising Excel</p>
                  <p className="text-xs text-green-700">Extracts specs, BOM &amp; images — matches variants of <span className="font-medium">{product.name}</span> automatically</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Button
                  size="sm"
                  onClick={() => excelInputRef.current?.click()}
                  disabled={uploading}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? 'Uploading...' : 'Upload Excel'}
                </Button>
                {uploadProgress && (
                  <p className="text-xs text-green-700 font-medium">{uploadProgress}</p>
                )}
              </div>
              <input
                ref={excelInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleExcelUpload}
              />
            </div>

            {/* Upload result */}
            {uploadResult && (
              <div className="mt-3 pt-3 border-t border-green-200 space-y-2">
                {uploadResult.errors.length === 0 ? (
                  <div className="flex items-start gap-2 text-green-800">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
                    <div className="text-xs space-y-0.5">
                      <p className="font-semibold">Import successful!</p>
                      <p>
                        {uploadResult.skus_matched} of {uploadResult.skus_found} SKU(s) matched this product
                        {(uploadResult.colors_found?.length ?? 0) > 0 && ` · Colors: ${uploadResult.colors_found.join(', ')}`}
                      </p>
                      <p>{uploadResult.bom_items_found} BOM items · {uploadResult.images_uploaded} images uploaded</p>
                      {uploadResult.fields_updated.length > 0 && (
                        <p>Fields updated: {uploadResult.fields_updated.join(', ')}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-red-700 space-y-1">
                    {uploadResult.errors.map((e, i) => <p key={i}>⚠ {e}</p>)}
                  </div>
                )}
                {(uploadResult.other_products_in_file?.length ?? 0) > 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                    File also contains: {uploadResult.other_products_in_file.join(', ')} — upload from those product pages to import their data.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Merchandising Details</CardTitle>
          {data?.is_locked && (
            <span className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
              <Lock className="h-3 w-3" /> Stage Locked
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2 block">Dimensions</Label>
            <div className="grid grid-cols-4 gap-2">
              {['length', 'width', 'height'].map((dim) => (
                <div key={dim} className="space-y-1">
                  <p className="text-xs text-gray-500 capitalize">{dim}</p>
                  <Input
                    placeholder="0"
                    value={(form.dimensions as Record<string, string>)[dim] || ''}
                    onChange={(e) => setForm({ ...form, dimensions: { ...form.dimensions, [dim]: e.target.value } })}
                    disabled={!canEdit}
                  />
                </div>
              ))}
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Unit</p>
                <Input
                  placeholder="cm"
                  value={form.dimensions?.unit || ''}
                  onChange={(e) => setForm({ ...form, dimensions: { ...form.dimensions, unit: e.target.value } })}
                  disabled={!canEdit}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Volume</Label>
              <Input placeholder="e.g. 28L" value={form.volume} onChange={(e) => setForm({ ...form, volume: e.target.value })} disabled={!canEdit} />
            </div>
            <div className="space-y-1.5">
              <Label>Weight</Label>
              <Input placeholder="e.g. 850g" value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} disabled={!canEdit} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Compartments</Label>
            <Textarea
              placeholder="Describe compartment layout..."
              value={form.compartments}
              onChange={(e) => setForm({ ...form, compartments: e.target.value })}
              disabled={!canEdit}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Materials</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.materials.map((m, i) => (
                <span key={i} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full">
                  {m}
                  {canEdit && (
                    <button onClick={() => setForm({ ...form, materials: form.materials.filter((_, j) => j !== i) })}>
                      <X className="h-3 w-3 hover:text-red-500" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <Input
                  placeholder="Add material..."
                  value={newMaterial}
                  onChange={(e) => setNewMaterial(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newMaterial.trim()) {
                      setForm({ ...form, materials: [...form.materials, newMaterial.trim()] })
                      setNewMaterial('')
                    }
                  }}
                />
                <Button type="button" variant="outline" size="icon"
                  onClick={() => { if (newMaterial.trim()) { setForm({ ...form, materials: [...form.materials, newMaterial.trim()] }); setNewMaterial('') } }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          {canEdit && (
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saved ? 'Saved!' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={markComplete} disabled={saving}
                className={data?.is_completed ? 'text-orange-600 border-orange-200' : 'text-green-600 border-green-200'}
              >
                {data?.is_completed ? 'Mark Incomplete' : 'Mark Complete'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

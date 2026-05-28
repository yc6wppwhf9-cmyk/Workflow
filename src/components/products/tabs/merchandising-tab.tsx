'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Save, Plus, X, Upload, FileSpreadsheet, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import * as XLSX from 'xlsx'
import { parseMerchExcel, filterSkusForProduct, aggregateMerchFields, buildColourVariants, extractProductBaseName } from '@/lib/parse-merch-excel'
import type { Product, Profile, MerchandisingData } from '@/lib/types'

interface MerchandisingTabProps {
  product: Product
  profile: Profile
  data: MerchandisingData | null
  merchandisingUsers: Pick<Profile, 'id' | 'full_name'>[]
}

type FormState = {
  dimensions: { length: string; width: string; height: string; unit: string }
  volume: string
  weight: string
  compartments: string
  materials: string[]
  color_code: string
  number_of_zips: string
  pocket_compartments: string
  main_compartments: string
  unique_purpose: string
  laptop_compartment: string
  rain_cover: string
  back_padded: string
  season_year: string
  bottle_slot: string
  character_name: string
  theme: string
  main_material: string
  material_spec: string
}

function initForm(data: MerchandisingData | null): FormState {
  return {
    dimensions: (data?.dimensions as FormState['dimensions']) || { length: '', width: '', height: '', unit: 'inches' },
    volume: data?.volume || '',
    weight: data?.weight || '',
    compartments: data?.compartments || '',
    materials: data?.materials || [],
    color_code: data?.color_code || '',
    number_of_zips: data?.number_of_zips || '',
    pocket_compartments: data?.pocket_compartments || '',
    main_compartments: data?.main_compartments || '',
    unique_purpose: data?.unique_purpose || '',
    laptop_compartment: data?.laptop_compartment || '',
    rain_cover: data?.rain_cover || '',
    back_padded: data?.back_padded || '',
    season_year: data?.season_year || '',
    bottle_slot: data?.bottle_slot || '',
    character_name: data?.character_name || '',
    theme: data?.theme || '',
    main_material: data?.main_material || '',
    material_spec: data?.material_spec || '',
  }
}

export function MerchandisingTab({ product, profile, data, merchandisingUsers }: MerchandisingTabProps) {
  const router = useRouter()
  const isTeamMember = profile.role === 'merchandising'
  const isHead = ['admin', 'merchandising_head'].includes(profile.role)
  const isAssigned = data?.assigned_to === profile.id
  const isAtMerchStage = product.workflow_stage === 'merchandising_completed'
  const canEditFields = !data?.is_locked && !data?.is_completed && isHead && isAtMerchStage
  const showActions = !data?.is_locked && isHead && isAtMerchStage
  // Attribute form: head always sees it; everyone else only after marked complete
  const showAttributeForm = isHead || !!data?.is_completed

  const [activeVersion, setActiveVersion] = useState<'attribute' | 'production'>('attribute')
  const [attrForm, setAttrForm] = useState<FormState>(() => initForm(data))
  const [prodForm, setProdForm] = useState<FormState>(() =>
    data?.production_fields ? initForm(data.production_fields as unknown as Parameters<typeof initForm>[0]) : initForm(null)
  )
  const [hasProd, setHasProd] = useState(!!data?.production_fields)
  const form = activeVersion === 'attribute' ? attrForm : prodForm
  const setForm = activeVersion === 'attribute' ? setAttrForm : setProdForm
  const [newMaterial, setNewMaterial] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [assignedTo, setAssignedTo] = useState(data?.assigned_to || '')

  const excelInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [uploadResult, setUploadResult] = useState<{
    skus_found: number; skus_matched: number; colors_found: string[]
    other_products_in_file: string[]; bom_items_found: number
    images_uploaded: number; fields_updated: string[]; errors: string[]
    version_saved?: 'attribute' | 'production'
    sheet_names?: string[]
  } | null>(null)

  function set(field: keyof FormState, value: unknown) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    const supabase = createClient()
    let versionLabel: 'attribute' | 'production'

    if (activeVersion === 'production') {
      const { error } = await supabase.from('merchandising_data').update({ production_fields: form, updated_by: profile.id }).eq('product_id', product.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
      setProdForm({ ...form })
      setHasProd(true)
      versionLabel = 'production'
    } else {
      const { error } = await supabase.from('merchandising_data').update({ ...attrForm, updated_by: profile.id }).eq('product_id', product.id)
      if (error) { setSaveError(error.message); setSaving(false); return }
      versionLabel = 'attribute'
      // First manual edit on attribute: also create production as a copy, then switch to it
      if (!hasProd) {
        await supabase.from('merchandising_data').update({ production_fields: attrForm, updated_by: profile.id }).eq('product_id', product.id)
        setProdForm({ ...attrForm })
        setHasProd(true)
        setActiveVersion('production')
        versionLabel = 'production'
      }
    }

    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: `updated merchandising data (${versionLabel})`, department: 'merchandising',
    })
    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); router.refresh() }, 2000)
  }

  async function handleExcelUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadResult(null)

    const errors: string[] = []
    let images_uploaded = 0

    try {
      setUploadProgress('Parsing Excel...')
      const arrayBuffer = await file.arrayBuffer()
      const wb = XLSX.read(arrayBuffer, { type: 'array' })
      const sheetNames = wb.SheetNames
      const parsed = parseMerchExcel(arrayBuffer, product.name)

      const relevantSkus = filterSkusForProduct(parsed.skus, product.name)
      const otherProducts = parsed.skus
        .filter(s => !relevantSkus.includes(s))
        .map(s => s.styleName)
        .filter((v, i, a) => a.indexOf(v) === i)

      const colourVariants = buildColourVariants(relevantSkus, product.name, parsed.bomByStyle)
      const colourTags = colourVariants.map(v => v.colourTag)
      const merch_fields = relevantSkus.length > 0 ? aggregateMerchFields(relevantSkus) : null
      const extracted_product_name = extractProductBaseName(relevantSkus)

      setUploadProgress('Extracting images...')
      type ImgEntry = { name: string; bytes: Uint8Array; mimeType: string; colourTag: string | null }
      const imagesToUpload: ImgEntry[] = []

      try {
        const { default: JSZip } = await import('jszip')
        const zip = await JSZip.loadAsync(arrayBuffer)

        // Find the DETAILS PICS sheet's drawing via its own .rels file
        // sheetNames index matches xl/worksheets/sheet{N+1}.xml (1-based)
        let picDrawing = '', picRels = ''
        const detailsPicsIdx = sheetNames.findIndex((n: string) =>
          n.toUpperCase().replace(/\s+/g, ' ').includes('DETAILS')
        )
        if (detailsPicsIdx >= 0) {
          const sheetNum = detailsPicsIdx + 1
          const sheetRelsFile = zip.file(`xl/worksheets/_rels/sheet${sheetNum}.xml.rels`)
          if (sheetRelsFile) {
            const sheetRelsText = await sheetRelsFile.async('string')
            const dm = sheetRelsText.match(/Target="\.\.\/drawings\/(drawing\d+\.xml)"/)
            if (dm) { picDrawing = `xl/drawings/${dm[1]}`; picRels = `xl/drawings/_rels/${dm[1]}.rels` }
          }
        }
        // Fall back to the drawing with the most images
        if (!picDrawing) {
          let bestCount = 0
          for (let i = 1; i <= 10; i++) {
            const relsFile = zip.file(`xl/drawings/_rels/drawing${i}.xml.rels`)
            if (!relsFile) break
            const relsText = await relsFile.async('string')
            const count = (relsText.match(/Target="\.\.\/media\//g) || []).length
            if (count > bestCount) { bestCount = count; picDrawing = `xl/drawings/drawing${i}.xml`; picRels = `xl/drawings/_rels/drawing${i}.xml.rels` }
          }
        }

        const rIdToFile: Record<string, string> = {}
        if (picRels) {
          const relsText = await zip.file(picRels)!.async('string')
          for (const m of relsText.matchAll(/Id="(rId\d+)"[^>]*Target="\.\.\/media\/(image\d+\.\w+)"/g))
            rIdToFile[m[1]] = m[2]
        }

        const imageColourMap = new Map<string, string>()
        if (picDrawing && colourTags.length > 0) {
          const drawingText = await zip.file(picDrawing)!.async('string')
          const anchors = [...drawingText.matchAll(/<xdr:twoCellAnchor[^>]*>([\s\S]*?)<\/xdr:twoCellAnchor>/g)]
          const positions: Array<{ row: number; col: number; file: string }> = []
          for (const anchor of anchors) {
            const rowMatch = anchor[1].match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)
            const colMatch = anchor[1].match(/<xdr:from><xdr:col>(\d+)<\/xdr:col>/)
            const rIdMatch = anchor[1].match(/r:embed="(rId\d+)"/)
            if (rowMatch && rIdMatch) {
              const f = rIdToFile[rIdMatch[1]]
              if (f) positions.push({ row: parseInt(rowMatch[1]), col: colMatch ? parseInt(colMatch[1]) : 0, file: f })
            }
          }

          const effectiveTags = colourTags.filter(t => t.toLowerCase() !== 'color' && t.toLowerCase() !== 'colour')
          const tagsToMap = effectiveTags.length > 0 ? effectiveTags : colourTags
          const tagsLower = tagsToMap.map(t => t.toLowerCase())

          // PRIMARY: read text cells in DETAILS PICS sheet — find rows that contain colour name labels.
          // Each group of images sits directly below its colour label row.
          const colourLabelRows: Array<{ row: number; colourTag: string }> = []
          if (detailsPicsIdx >= 0) {
            const detailsSheet = wb.Sheets[sheetNames[detailsPicsIdx]]
            if (detailsSheet) {
              const cellData = XLSX.utils.sheet_to_json<string[]>(detailsSheet, { header: 1, defval: '' }) as string[][]
              for (let r = 0; r < cellData.length; r++) {
                for (const cell of cellData[r]) {
                  const cellStr = String(cell || '').trim().toLowerCase()
                  if (!cellStr || cellStr.length > 60) continue
                  const idx = tagsLower.findIndex(t => cellStr === t || cellStr.includes(t) || t.includes(cellStr))
                  if (idx >= 0) { colourLabelRows.push({ row: r, colourTag: tagsToMap[idx] }); break }
                }
              }
            }
          }

          if (colourLabelRows.length > 0) {
            // Map each image to the nearest colour label that appears at or before its row
            for (const pos of positions) {
              let bestRow = -1, matched = ''
              for (const { row, colourTag } of colourLabelRows) {
                if (row <= pos.row && row > bestRow) { bestRow = row; matched = colourTag }
              }
              if (matched) imageColourMap.set(pos.file, matched)
            }
          } else {
            // Fallback: position-based (row count vs col count)
            const uniqueCols = [...new Set(positions.map(p => p.col))].sort((a, b) => a - b)
            const uniqueRows = [...new Set(positions.map(p => p.row))].sort((a, b) => a - b)
            if (uniqueRows.length >= uniqueCols.length) {
              for (const pos of positions) {
                const idx = uniqueRows.indexOf(pos.row)
                if (idx < tagsToMap.length) imageColourMap.set(pos.file, tagsToMap[idx])
              }
            } else {
              const colsPerColour = Math.max(1, Math.round(uniqueCols.length / tagsToMap.length))
              for (const pos of positions) {
                const colIdx = uniqueCols.indexOf(pos.col)
                const colourIdx = Math.floor(colIdx / colsPerColour)
                if (colourIdx < tagsToMap.length) imageColourMap.set(pos.file, tagsToMap[colourIdx])
              }
            }
          }
        }

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
          imagesToUpload.push({ name, bytes, mimeType, colourTag: imageColourMap.get(name) || null })
        }
      } catch (imgErr) {
        errors.push('Image extraction failed: ' + String(imgErr))
      }

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
        fileRecords.push({
          product_id: product.id, name: img.name, file_url: storagePath,
          file_type: img.mimeType, file_size: img.bytes.length,
          department: 'merchandising', uploaded_by: profile.id, colour_tag: img.colourTag,
        })
        images_uploaded++
      }

      setUploadProgress('Saving records...')
      const excelPath = `${product.id}/merch_excel_${ts}_${file.name}`
      const { error: excelErr } = await supabase.storage.from('product-files')
        .upload(excelPath, arrayBuffer, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: true })
      if (!excelErr) {
        fileRecords.push({
          product_id: product.id, name: file.name, file_url: excelPath,
          file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          file_size: file.size, department: 'merchandising', uploaded_by: profile.id, colour_tag: null,
        })
      }

      if (fileRecords.length > 0) await supabase.from('product_files').insert(fileRecords)

      setUploadProgress('Updating product data...')
      const primarySku = relevantSkus[0]
      const apiRes = await fetch('/api/upload-merch-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          merch_fields,
          colour_variants: colourVariants,
          bom_items: parsed.bomItems,
          designer_name: primarySku?.designerName || null,
          sample_color: colourTags.join(', ') || null,
          cutting_items: parsed.cuttingItems,
          extracted_product_name: extracted_product_name || null,
          summary: `uploaded merchandising Excel "${file.name}" — ${relevantSkus.length} variant(s) matched, ${parsed.bomItems.length} BOM items, ${images_uploaded} images`,
        }),
      })
      const apiJson = await apiRes.json()
      const version_saved: 'attribute' | 'production' = apiJson.version_saved || 'attribute'

      if (merch_fields) {
        const newForm = { ...initForm(null), ...merch_fields } as FormState
        if (version_saved === 'production') {
          setProdForm(newForm)
          setHasProd(true)
          setActiveVersion('production')
        } else {
          setAttrForm(newForm)
          setActiveVersion('attribute')
        }
      }

      setUploadResult({
        skus_found: parsed.skus.length, skus_matched: relevantSkus.length,
        colors_found: colourTags, other_products_in_file: otherProducts,
        bom_items_found: parsed.bomItems.length, images_uploaded,
        fields_updated: merch_fields ? ['dimensions', 'weight', 'compartments', 'materials', 'colour_variants', '+ all specs'] : [],
        errors, version_saved, sheet_names: sheetNames,
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

  async function handleAssign(userId: string) {
    setAssignedTo(userId)
    const supabase = createClient()
    await supabase.from('merchandising_data').update({ assigned_to: userId || null, updated_by: profile.id }).eq('product_id', product.id)
    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: `assigned merchandising task to ${merchandisingUsers.find(u => u.id === userId)?.full_name || 'team member'}`,
      department: 'merchandising',
    })
  }

  async function toggleHandover() {
    if (data?.attribute_sheet_handed_over) return
    const supabase = createClient()
    await supabase.from('merchandising_data').update({ attribute_sheet_handed_over: true, updated_by: profile.id }).eq('product_id', product.id)
    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: 'marked attribute sheet as handed over',
      department: 'merchandising',
    })
    router.refresh()
  }

  async function markComplete() {
    const becomingComplete = !data?.is_completed
    setSaving(true)
    const supabase = createClient()
    await supabase.from('merchandising_data').update({
      ...attrForm, is_completed: becomingComplete, updated_by: profile.id,
    }).eq('product_id', product.id)

    if (becomingComplete && product.workflow_stage === 'merchandising_completed') {
      await supabase.rpc('advance_product_stage', {
        p_product_id: product.id,
        p_next_stage: 'bom_finalized',
        p_user_id: profile.id,
        p_action: 'marked merchandising complete — stage advanced to BOM',
        p_department: 'merchandising',
      })
      fetch('/api/notify-stage-advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, product_name: product.name, next_stage: 'bom_finalized' }),
      }).catch(() => {})
    }

    setSaving(false)
    router.refresh()
  }

  const F = ({ label, field, placeholder, half }: { label: string; field: keyof FormState; placeholder?: string; half?: boolean }) => (
    <div className={`space-y-1.5 ${half ? '' : ''}`}>
      <Label className="text-xs">{label}</Label>
      <Input
        placeholder={placeholder || ''}
        value={(form[field] as string) || ''}
        onChange={e => set(field, e.target.value)}
        disabled={!canEditFields}
        className="h-8 text-sm"
      />
    </div>
  )

  return (
    <div className="max-w-3xl space-y-4">

      {/* Head: Assignment Card */}
      {isHead && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Assign Merchandising Task</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Assign to team member</Label>
              <Select value={assignedTo} onValueChange={handleAssign} disabled={data?.is_locked || data?.is_completed}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select team member..." />
                </SelectTrigger>
                <SelectContent>
                  {merchandisingUsers.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-gray-600">
              Attribute Sheet:{' '}
              {data?.attribute_sheet_handed_over ? (
                <span className="text-green-600 font-medium">Handed Over ✓</span>
              ) : (
                <span className="text-amber-600">Pending</span>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Team Member: Task Card */}
      {isTeamMember && (
        isAssigned ? (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-4 pb-4">
              <div>
                <p className="text-sm font-semibold text-blue-900">Your Task</p>
                <p className="text-xs text-blue-700 mt-0.5">Create the attribute sheet and hand it over to the merchandising head.</p>
              </div>
              <label className="flex items-center gap-2 cursor-pointer select-none mt-3">
                <input
                  type="checkbox"
                  checked={data?.attribute_sheet_handed_over || false}
                  onChange={toggleHandover}
                  disabled={data?.attribute_sheet_handed_over || false}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <span className="text-sm font-medium text-blue-900">Attribute Sheet Handed Over</span>
              </label>
            </CardContent>
          </Card>
        ) : (
          !data?.is_completed && (
            <Card>
              <CardContent className="py-8 text-center">
                <p className="text-sm text-gray-500">Waiting for the merchandising head to assign this task to you.</p>
              </CardContent>
            </Card>
          )
        )
      )}

      {/* Placeholder for team members / other roles before completion */}
      {!showAttributeForm && !isTeamMember && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-gray-400">Attribute sheet will be visible here once the merchandising head marks it complete.</p>
          </CardContent>
        </Card>
      )}

      {/* Excel Upload Card — head only, at merch stage */}
      {canEditFields && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-900">Upload Merchandising Excel</p>
                  <p className="text-xs text-green-700">Extracts all specs, BOM &amp; images — matches variants of <span className="font-medium">{product.name}</span> automatically</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <Button size="sm" onClick={() => excelInputRef.current?.click()} disabled={uploading} className="bg-green-600 hover:bg-green-700">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {uploading ? 'Processing...' : 'Upload Excel'}
                </Button>
                {uploadProgress && <p className="text-xs text-green-700 font-medium">{uploadProgress}</p>}
              </div>
              <input ref={excelInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleExcelUpload} />
            </div>
            {uploadResult && (
              <div className="mt-3 pt-3 border-t border-green-200 space-y-2">
                {uploadResult.errors.length === 0 ? (
                  <div className="flex items-start gap-2 text-green-800">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-600" />
                    <div className="text-xs space-y-0.5">
                      <p className="font-semibold">
                        {uploadResult.version_saved === 'production' ? 'Production version created!' : 'Attribute data imported!'}
                      </p>
                      <p>{uploadResult.skus_matched} of {uploadResult.skus_found} SKU(s) matched · Colors: {uploadResult.colors_found.join(', ')}</p>
                      <p>{uploadResult.bom_items_found} BOM items · {uploadResult.images_uploaded} images uploaded</p>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-red-700 space-y-1">
                    {uploadResult.errors.map((e, i) => <p key={i}>⚠ {e}</p>)}
                  </div>
                )}
                {uploadResult.sheet_names && (
                  <p className="text-xs text-gray-500">Sheets found: {uploadResult.sheet_names.join(' · ')}</p>
                )}
                {uploadResult.other_products_in_file.length > 0 && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                    File also contains: {uploadResult.other_products_in_file.join(', ')} — upload from those product pages to import their data.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {showAttributeForm && <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveVersion('attribute')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${activeVersion === 'attribute' ? 'bg-blue-100 text-blue-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Attribute
            </button>
            <button
              onClick={() => hasProd && setActiveVersion('production')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${!hasProd ? 'text-gray-300 cursor-not-allowed' : activeVersion === 'production' ? 'bg-amber-100 text-amber-700' : 'text-gray-500 hover:text-gray-700'}`}
              title={!hasProd ? 'No production version yet — re-upload the Excel to create one' : undefined}
            >
              Production
            </button>
          </div>
          {data?.is_locked && (
            <span className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
              <Lock className="h-3 w-3" /> Stage Locked
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Product Info */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Product Info</p>
            <div className="grid grid-cols-2 gap-3">
              {F({ label: "Season + Year", field: "season_year", placeholder: "e.g. BTS - 2026" })}
              {F({ label: "Color Code", field: "color_code", placeholder: "e.g. NBL" })}
            </div>
          </div>

          {/* Dimensions & Weight */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Dimensions & Weight</p>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {(['length', 'width', 'height'] as const).map((dim) => (
                <div key={dim} className="space-y-1">
                  <p className="text-xs text-gray-500">{dim === 'length' ? 'L (in)' : dim === 'width' ? 'W (in)' : 'D (in)'}</p>
                  <Input
                    placeholder="0"
                    value={(form.dimensions as Record<string, string>)[dim] || ''}
                    onChange={e => set('dimensions', { ...form.dimensions, [dim]: e.target.value })}
                    disabled={!canEditFields}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
              <div className="space-y-1">
                <p className="text-xs text-gray-500">Unit</p>
                <Input
                  placeholder="inches"
                  value={form.dimensions?.unit || ''}
                  onChange={e => set('dimensions', { ...form.dimensions, unit: e.target.value })}
                  disabled={!canEditFields}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {F({ label: "Weight (gm)", field: "weight", placeholder: "e.g. 880" })}
              {F({ label: "Volume", field: "volume", placeholder: "e.g. 28L" })}
            </div>
          </div>

          {/* Compartments */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Compartments & Zips</p>
            <div className="grid grid-cols-3 gap-3">
              {F({ label: "Main Compartments", field: "main_compartments", placeholder: "e.g. 2" })}
              {F({ label: "Pocket Compartments", field: "pocket_compartments", placeholder: "e.g. 3" })}
              {F({ label: "Number of Zips", field: "number_of_zips", placeholder: "e.g. 5" })}
              {F({ label: "Laptop Compartment", field: "laptop_compartment", placeholder: "YES / NO" })}
              {F({ label: "Bottle Slots", field: "bottle_slot", placeholder: "e.g. 2" })}
              {F({ label: "Rain Cover", field: "rain_cover", placeholder: "YES / NO" })}
            </div>
          </div>

          {/* Construction */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Construction & Features</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {F({ label: "Back Padded", field: "back_padded", placeholder: "YES / NO" })}
              {F({ label: "Unique Purpose", field: "unique_purpose", placeholder: "e.g. EXTENSION" })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {F({ label: "Character", field: "character_name", placeholder: "e.g. NA" })}
              {F({ label: "Theme", field: "theme", placeholder: "e.g. NA" })}
            </div>
          </div>

          {/* Materials */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Materials</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {F({ label: "Main Material", field: "main_material", placeholder: "e.g. PVC POLYSTER" })}
              {F({ label: "Material Spec", field: "material_spec", placeholder: "e.g. 1680" })}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Additional Materials</Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {form.materials.map((m, i) => (
                  <span key={i} className="flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2.5 py-1 rounded-full">
                    {m}
                    {canEditFields && (
                      <button onClick={() => set('materials', form.materials.filter((_, j) => j !== i))}>
                        <X className="h-3 w-3 hover:text-red-500" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {canEditFields && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Add material..."
                    value={newMaterial}
                    onChange={e => setNewMaterial(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newMaterial.trim()) {
                        set('materials', [...form.materials, newMaterial.trim()])
                        setNewMaterial('')
                      }
                    }}
                    className="h-8 text-sm"
                  />
                  <Button type="button" variant="outline" size="icon" className="h-8 w-8"
                    onClick={() => { if (newMaterial.trim()) { set('materials', [...form.materials, newMaterial.trim()]); setNewMaterial('') } }}
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {saveError && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{saveError}</p>
          )}
          {saved && (
            <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">Changes saved.</p>
          )}
          {showActions && (
            <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
              {canEditFields && (
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </Button>
              )}
              {!data?.is_completed && (
                <Button
                  variant="outline"
                  onClick={markComplete}
                  disabled={saving || !data?.attribute_sheet_handed_over}
                  className="text-green-600 border-green-200"
                  title={!data?.attribute_sheet_handed_over ? 'Attribute sheet must be handed over first' : ''}
                >
                  Mark Complete
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>}
    </div>
  )
}

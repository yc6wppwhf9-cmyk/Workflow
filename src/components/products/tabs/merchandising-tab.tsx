'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Download, Loader2, Lock, Save, Plus, X, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, UserCheck, Send, Printer, ChevronLeft, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { parseMerchExcel, filterSkusForProduct, aggregateMerchFields, buildColourVariants, extractProductBaseName } from '@/lib/parse-merch-excel'
import type { Product, Profile, MerchandisingData, DesignData, ProductFile } from '@/lib/types'

interface MerchandisingTabProps {
  product: Product
  profile: Profile
  data: MerchandisingData | null
  merchandisingUsers: Pick<Profile, 'id' | 'full_name'>[]
  designData?: DesignData | null
  files?: ProductFile[]
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

export function MerchandisingTab({ product, profile, data, merchandisingUsers, designData, files = [] }: MerchandisingTabProps) {
  const router = useRouter()
  const isTeamMember = profile.role === 'merchandising'
  const isHead = ['admin', 'merchandising_head'].includes(profile.role)
  const printFiles = files.filter(f => f.department === 'design' && f.colour_tag === 'print')
  const printImageFiles = printFiles.filter(f => f.file_type?.startsWith('image/'))
  const [printLightboxIdx, setPrintLightboxIdx] = useState<number | null>(null)
  const isAssigned = data?.assigned_to === profile.id
  const isSubmitted = !!data?.attribute_sheet_handed_over
  const isAtMerchStage = product.workflow_stage === 'merchandising_completed'
  // Upload is available as long as the data isn't locked/completed:
  // head can always upload; assigned team member can re-upload at any time (even after submitting)
  const canUploadExcel = !data?.is_locked && !data?.is_completed && (
    isHead || (isTeamMember && isAssigned)
  )
  // Whoever may upload the Excel may also edit + save the fields it fills —
  // the head, or the merchandising team member the product is assigned to.
  // (Previously head-only and merch-stage-only, so uploaders had no way to save.)
  const canEditFormFields = !data?.is_locked && !data?.is_completed && (
    isHead || (isTeamMember && isAssigned)
  )
  const showActions = !data?.is_locked && isHead && isAtMerchStage
  // Attribute form visible to head and assigned team member (read-only for team)
  const showAttributeForm = isHead || (isTeamMember && isAssigned) || !!data?.is_completed

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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmProductName, setConfirmProductName] = useState(product.display_name || product.name || '')
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [assignedTo, setAssignedTo] = useState(data?.assigned_to || '')
  const [savingAssign, setSavingAssign] = useState(false)
  const savingAssignRef = useRef(false)

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
      const { read, utils: xlsxUtils } = await import('xlsx')
      const wb = read(arrayBuffer, { type: 'array' })
      const sheetNames = wb.SheetNames
      const parsed = parseMerchExcel(arrayBuffer, product.name)

      const relevantSkus = filterSkusForProduct(parsed.skus, product.name)
      const otherProducts = parsed.skus
        .filter(s => !relevantSkus.includes(s))
        .map(s => s.styleName)
        .filter((v, i, a) => a.indexOf(v) === i)

      const colourVariants = buildColourVariants(relevantSkus, product.name, parsed.bomByStyle, parsed.bomByColour)
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
          // Map colourTag → styleName so images are tagged with the full unique style name.
          // Two different designs can share the same colourTag ("Black") but have different
          // styleNames ("CONNECT 001 BLACK" vs "CONNECT 002 BLACK") — using styleName as the
          // image key prevents cross-design image bleed in the Colours tab.
          const tagToStyleName = new Map(
            colourVariants.map(v => [v.colourTag.toLowerCase(), v.styleName])
          )
          const toStyleKey = (tag: string) => tagToStyleName.get(tag.toLowerCase()) ?? tag

          // PRIMARY: read text cells in DETAILS PICS sheet — find rows that contain colour name labels.
          // Each group of images sits directly below its colour label row.
          const colourLabelRows: Array<{ row: number; colourTag: string }> = []
          if (detailsPicsIdx >= 0) {
            const detailsSheet = wb.Sheets[sheetNames[detailsPicsIdx]]
            if (detailsSheet) {
              const cellData = xlsxUtils.sheet_to_json<string[]>(detailsSheet, { header: 1, defval: '' }) as string[][]
              for (let r = 0; r < cellData.length; r++) {
                for (const cell of cellData[r]) {
                  const cellStr = String(cell || '').trim().toLowerCase()
                  if (!cellStr || cellStr.length > 60) continue
                  const idx = tagsLower.findIndex(t => cellStr === t || cellStr.includes(t) || t.includes(cellStr))
                  if (idx >= 0) { colourLabelRows.push({ row: r, colourTag: toStyleKey(tagsToMap[idx]) }); break }
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
                if (idx < tagsToMap.length) imageColourMap.set(pos.file, toStyleKey(tagsToMap[idx]))
              }
            } else {
              const colsPerColour = Math.max(1, Math.round(uniqueCols.length / tagsToMap.length))
              for (const pos of positions) {
                const colIdx = uniqueCols.indexOf(pos.col)
                const colourIdx = Math.floor(colIdx / colsPerColour)
                if (colourIdx < tagsToMap.length) imageColourMap.set(pos.file, toStyleKey(tagsToMap[colourIdx]))
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
        file_size: number; department: 'merchandising'; uploaded_by: string; colour_tag: string | null
      }> = []

      // Upload images via the server-side API (Cloudinary) — direct Supabase Storage
      // client uploads are blocked by bucket RLS for the merchandising role.
      for (let i = 0; i < imagesToUpload.length; i++) {
        const img = imagesToUpload[i]
        setUploadProgress(`Uploading images (${i + 1}/${imagesToUpload.length})...`)
        const fd = new FormData()
        fd.append('file', new Blob([img.bytes as BlobPart], { type: img.mimeType }), img.name)
        fd.append('folder', product.id)
        const res = await fetch('/api/upload-file', { method: 'POST', body: fd })
        if (!res.ok) { errors.push(`Image failed: ${img.name}`); continue }
        const { url } = await res.json()
        fileRecords.push({
          product_id: product.id, name: img.name, file_url: url,
          file_type: img.mimeType, file_size: img.bytes.length,
          department: 'merchandising', uploaded_by: profile.id, colour_tag: img.colourTag,
        })
        images_uploaded++
      }

      setUploadProgress('Saving records...')
      // Upload the raw Excel via API too (same reason — RLS blocks client-side storage writes)
      const excelFd = new FormData()
      excelFd.append('file', file)
      excelFd.append('folder', product.id)
      const excelUpRes = await fetch('/api/upload-file', { method: 'POST', body: excelFd })
      if (excelUpRes.ok) {
        const { url: excelUrl } = await excelUpRes.json()
        fileRecords.push({
          product_id: product.id, name: file.name, file_url: excelUrl,
          file_type: file.type,
          file_size: file.size, department: 'merchandising', uploaded_by: profile.id, colour_tag: null,
        })
      }

      if (fileRecords.length > 0) await supabase.from('product_files').insert(fileRecords)

      setUploadProgress('Saving colour variants...')
      if (colourVariants.length > 0) {
        // Merge with existing variants using styleName as the unique key.
        // Design 1 BLK ("CONNECT 001 BLACK") and Design 2 BLK ("CONNECT 002 BLACK") are
        // different entries — same colourTag, different styleName. Merging by colourTag alone
        // would wrongly overwrite Design 1's data when Design 2 is uploaded.
        const { data: existingMD } = await supabase
          .from('merchandising_data').select('colour_variants').eq('product_id', product.id).single()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing: any[] = (existingMD?.colour_variants as any[]) || []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newMap = new Map(colourVariants.map((v: any) => [String(v.styleName || '').toLowerCase().trim(), v]))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const merged = existing.map((v: any) => newMap.has(String(v.styleName || '').toLowerCase().trim()) ? newMap.get(String(v.styleName || '').toLowerCase().trim()) : v)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const [style, v] of newMap) { if (!existing.some((e: any) => String(e.styleName || '').toLowerCase().trim() === style)) merged.push(v) }
        await supabase.from('merchandising_data').update({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          colour_variants: merged as any,
          updated_by: profile.id,
        }).eq('product_id', product.id)
      }

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
      if (!apiRes.ok) errors.push(`API error: ${apiJson.error || apiRes.statusText}`)
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

  async function handleAssign() {
    if (!assignedTo || savingAssignRef.current) return
    savingAssignRef.current = true
    setSavingAssign(true)
    try {
      const supabase = createClient()
      await supabase.from('merchandising_data').update({ assigned_to: assignedTo, updated_by: profile.id }).eq('product_id', product.id)
      const assignedUser = merchandisingUsers.find(u => u.id === assignedTo)
      await supabase.from('activity_logs').insert({
        product_id: product.id, user_id: profile.id,
        action: `assigned merchandising task to ${assignedUser?.full_name || 'team member'}`,
        department: 'merchandising',
      })
      if (assignedUser) {
        fetch('/api/notify-assignment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            product_id:        product.id,
            product_name:      product.name,
            assigned_to_id:    assignedTo,
            assigned_to_name:  assignedUser.full_name,
            assigned_to_email: (assignedUser as { full_name: string; email?: string }).email ?? '',
            department:        'merchandising',
            assigned_by_name:  profile.full_name,
          }),
        }).catch(() => {})
      }
      router.refresh()
    } finally {
      savingAssignRef.current = false
      setSavingAssign(false)
    }
  }

  async function submitForReview() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('merchandising_data').update({ attribute_sheet_handed_over: true, updated_by: profile.id }).eq('product_id', product.id)
    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: 'submitted attribute sheet for merchandising head review',
      department: 'merchandising',
    })
    setSaving(false)
    router.refresh()
  }

  async function markComplete() {
    const becomingComplete = !data?.is_completed
    setSaving(true)
    const supabase = createClient()

    // Save confirmed product name to display_name
    const finalName = confirmProductName.trim()
    if (finalName) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('products').update({ display_name: finalName }).eq('id', product.id)
    }

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
        disabled={!canEditFormFields}
        className="h-8 text-sm"
      />
    </div>
  )

  const designVariants: any[] = (designData?.variants || []).filter(
    (v: any) => v && (v.sample_color || v.farma || v.style_name || (Array.isArray(v.color_skus) && v.color_skus.length > 0))
  )

  return (
    <div className="max-w-3xl space-y-4">

      {/* Print Tech Pack shortcut */}
      <div className="flex justify-end">
        <Button
          size="sm" variant="outline" className="gap-1.5"
          onClick={() => {
            const w = window.open(`/print/${product.id}`, '_blank')
            if (w) w.onload = () => w.print()
          }}
        >
          <Printer className="h-3.5 w-3.5" /> Print Tech Pack
        </Button>
      </div>

      {/* Head: Assignment Card */}
      {isHead && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Assign Merchandising Task</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Assign to team member</Label>
              <div className="flex items-center gap-2">
                <Select
                  value={assignedTo}
                  onValueChange={setAssignedTo}
                  disabled={!!data?.assigned_to || data?.is_locked || data?.is_completed || savingAssign}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Select team member..." />
                  </SelectTrigger>
                  <SelectContent>
                    {merchandisingUsers.map(u => (
                      <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleAssign}
                  disabled={!!data?.assigned_to || !assignedTo || savingAssign}
                >
                  {savingAssign ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                  Assign
                </Button>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Attribute Sheet:{' '}
              {isSubmitted ? (
                <span className="text-green-600 font-medium">Submitted for Review ✓</span>
              ) : (
                <span className="text-amber-600">Not yet submitted</span>
              )}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Team Member: Task Card */}
      {isTeamMember && (
        isAssigned ? (
          <Card className={isSubmitted ? 'border-green-200 bg-green-50' : 'border-blue-200 bg-blue-50'}>
            <CardContent className="pt-4 pb-4">
              {isSubmitted ? (
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-green-900">Submitted for Review</p>
                    <p className="text-xs text-green-700 mt-0.5">The merchandising head will review and mark it complete.</p>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-blue-900">Your Task</p>
                  <p className="text-xs text-blue-700 mt-0.5">Upload the attribute Excel below, verify the data, then submit for head review.</p>
                  <Button
                    size="sm"
                    className="mt-3"
                    onClick={submitForReview}
                    disabled={saving || !data?.weight}
                    title={!data?.weight ? 'Upload the attribute Excel first' : ''}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Submit for Review
                  </Button>
                  {!data?.weight && <p className="text-xs text-blue-600 mt-1">Upload the Excel first to enable submit.</p>}
                </div>
              )}
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

      {/* Placeholder for other roles before completion */}
      {!showAttributeForm && !isTeamMember && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-gray-400">Attribute sheet will be visible here once the merchandising head marks it complete.</p>
          </CardContent>
        </Card>
      )}

      {/* Print Files — uploaded by design team, read-only */}
      {printFiles.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Print Files <span className="text-xs font-normal text-gray-400 ml-1">(uploaded by design team)</span></CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {printImageFiles.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {printImageFiles.map((img, i) => (
                  <div
                    key={img.id}
                    className="aspect-square rounded-lg overflow-hidden bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setPrintLightboxIdx(i)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.file_url} alt={img.name} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
            {printFiles.filter(f => !f.file_type?.startsWith('image/')).map(f => (
              <a
                key={f.id}
                href={f.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs text-blue-600 hover:underline"
              >
                <Download className="h-3.5 w-3.5 shrink-0" />
                {f.name}
              </a>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Print Files Lightbox */}
      {printLightboxIdx !== null && printImageFiles[printLightboxIdx] && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setPrintLightboxIdx(null)}
        >
          <button
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
            onClick={() => setPrintLightboxIdx(null)}
          >
            <X className="h-5 w-5" />
          </button>
          {printImageFiles.length > 1 && (
            <>
              <button
                className="absolute left-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
                onClick={e => { e.stopPropagation(); setPrintLightboxIdx(i => i !== null ? (i - 1 + printImageFiles.length) % printImageFiles.length : null) }}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                className="absolute right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
                onClick={e => { e.stopPropagation(); setPrintLightboxIdx(i => i !== null ? (i + 1) % printImageFiles.length : null) }}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}
          <div className="flex flex-col items-center gap-3 max-w-5xl max-h-screen p-16" onClick={e => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={printImageFiles[printLightboxIdx].file_url}
              alt={printImageFiles[printLightboxIdx].name}
              className="max-h-[80vh] max-w-full object-contain rounded-lg"
            />
            <p className="text-white/70 text-sm">{printImageFiles[printLightboxIdx].name}</p>
            {printImageFiles.length > 1 && (
              <p className="text-white/40 text-xs">{printLightboxIdx + 1} / {printImageFiles.length}</p>
            )}
          </div>
        </div>
      )}

      {/* Excel Upload Card — team member (before submit) and head */}
      {canUploadExcel && (
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
                {uploadResult.errors.length > 0 ? (
                  <div className="text-xs text-red-700 space-y-1">
                    {uploadResult.errors.map((e, i) => <p key={i}>⚠ {e}</p>)}
                  </div>
                ) : uploadResult.skus_matched === 0 ? (
                  /* 0 matches means the spec fields were NOT filled or saved — say so
                     loudly instead of showing a green success with "0 of N matched". */
                  <div className="flex items-start gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
                    <div className="text-xs space-y-0.5">
                      <p className="font-semibold">No SKU matched this product — spec fields were not filled.</p>
                      <p>
                        The sheet has {uploadResult.skus_found} SKU(s), but none match this product&apos;s name
                        (<span className="font-medium">{product.name}</span>).
                      </p>
                      {uploadResult.other_products_in_file.length > 0 && (
                        <p>Style names in the file: {uploadResult.other_products_in_file.join(', ')}</p>
                      )}
                      <p>Rename the product to match a style name in the sheet, or upload this file from the matching product.</p>
                    </div>
                  </div>
                ) : (
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
          <div className="flex items-center gap-2">
            <a
              href={`/api/export-merchandising-techpack?product_id=${product.id}`}
              download
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export Excel
            </a>
            {data?.is_locked && (
              <span className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
                <Lock className="h-3 w-3" /> Stage Locked
              </span>
            )}
          </div>
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
                    disabled={!canEditFormFields}
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
                  disabled={!canEditFormFields}
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
                    {canEditFormFields && (
                      <button onClick={() => set('materials', form.materials.filter((_, j) => j !== i))}>
                        <X className="h-3 w-3 hover:text-red-500" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
              {canEditFormFields && (
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
              {canEditFormFields && (
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </Button>
              )}
              {!data?.is_completed && (
                <Button
                  variant="outline"
                  onClick={() => setConfirmOpen(true)}
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
      {/* Custom confirm with compulsory product name */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex flex-col items-center mb-4">
              <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center mb-2">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 className="text-base font-semibold text-gray-900 text-center">Mark Merchandising Complete?</h3>
              <p className="text-sm text-gray-500 text-center mt-1">This will advance the product to BOM and notify the BOM team.</p>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Product Name <span className="text-red-500">*</span>
                <span className="font-normal text-gray-400 ml-1">(required before completing)</span>
              </label>
              <input
                type="text"
                value={confirmProductName}
                onChange={e => setConfirmProductName(e.target.value)}
                placeholder="e.g. Nike Campus Backpack Red"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              {!confirmProductName.trim() && (
                <p className="text-xs text-red-500 mt-1">Please enter a product name to continue.</p>
              )}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmOpen(false)} disabled={saving}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={() => { if (!confirmProductName.trim()) return; setConfirmOpen(false); markComplete() }}
                disabled={saving || !confirmProductName.trim()}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving…' : 'Yes, Mark Complete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

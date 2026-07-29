'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Download, Loader2, Lock, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, UserCheck, Send, Printer } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { parseMerchExcel, filterSkusForProduct, aggregateMerchFields, buildColourVariants, extractProductBaseName } from '@/lib/parse-merch-excel'
import { ColourVariantsTab } from './colour-variants-tab'
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
  const isAssigned = data?.assigned_to === profile.id
  const isSubmitted = !!data?.attribute_sheet_handed_over
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
  // Head/admin can always act — previously this also required the product to be
  // sitting at the merchandising stage, which hid the Submit to BOM button entirely.
  const showActions = !data?.is_locked && isHead

  const [activeVersion, setActiveVersion] = useState<'attribute' | 'production'>('attribute')
  const [attrForm, setAttrForm] = useState<FormState>(() => initForm(data))
  const [prodForm, setProdForm] = useState<FormState>(() =>
    data?.production_fields ? initForm(data.production_fields as unknown as Parameters<typeof initForm>[0]) : initForm(null)
  )
  const [hasProd, setHasProd] = useState(!!data?.production_fields)

  // Re-sync the form when the saved record actually changes (e.g. after an Excel
  // upload + router.refresh). Without this the useState seed stays stale and the
  // tab looks blank right after uploading. Keyed on updated_at so it doesn't
  // clobber in-progress edits (which don't change updated_at until saved).
  useEffect(() => {
    setAttrForm(initForm(data))
    setProdForm(data?.production_fields ? initForm(data.production_fields as unknown as Parameters<typeof initForm>[0]) : initForm(null))
    setHasProd(!!data?.production_fields)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.updated_at])

  const form = activeVersion === 'attribute' ? attrForm : prodForm
  const setForm = activeVersion === 'attribute' ? setAttrForm : setProdForm
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmProductName, setConfirmProductName] = useState(product.display_name || product.name || '')
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

          // Images are keyed by each variant's UNIQUE styleName. colourTag can repeat
          // across designs (two "LIGHT PINK" designs share "LPNK"), so keying by colour
          // collides — one design would get all the images and the other none.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const list = (colourVariants as any[]).filter(v => {
            const t = String(v.colourTag || '').toLowerCase()
            return t !== 'color' && t !== 'colour'
          })
          const variantList = list.length > 0 ? list : colourVariants

          // Which variant does a DETAILS PICS label cell refer to? Match on the full
          // style name first (unique), then the colour tag as a loose fallback.
          const matchVariantStyle = (cellStr: string): string | null => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let vi = (variantList as any[]).findIndex(v => {
              const sn = String(v.styleName || '').toLowerCase().trim()
              return sn && (cellStr === sn || cellStr.includes(sn) || sn.includes(cellStr))
            })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (vi < 0) vi = (variantList as any[]).findIndex(v => {
              const ct = String(v.colourTag || '').toLowerCase().trim()
              return ct && (cellStr === ct || cellStr.includes(ct))
            })
            return vi >= 0 ? String(variantList[vi].styleName || '') : null
          }

          // PRIMARY: DETAILS PICS text rows label each image group by its style/colour name.
          const styleLabelRows: Array<{ row: number; styleName: string }> = []
          if (detailsPicsIdx >= 0) {
            const detailsSheet = wb.Sheets[sheetNames[detailsPicsIdx]]
            if (detailsSheet) {
              const cellData = xlsxUtils.sheet_to_json<string[]>(detailsSheet, { header: 1, defval: '' }) as string[][]
              for (let r = 0; r < cellData.length; r++) {
                for (const cell of cellData[r]) {
                  const cellStr = String(cell || '').trim().toLowerCase()
                  if (!cellStr || cellStr.length > 80) continue
                  const sn = matchVariantStyle(cellStr)
                  if (sn) { styleLabelRows.push({ row: r, styleName: sn }); break }
                }
              }
            }
          }

          if (styleLabelRows.length > 0) {
            // Each image → the nearest style label at or above its row.
            for (const pos of positions) {
              let bestRow = -1, matched = ''
              for (const { row, styleName } of styleLabelRows) {
                if (row <= pos.row && row > bestRow) { bestRow = row; matched = styleName }
              }
              if (matched) imageColourMap.set(pos.file, matched)
            }
          } else {
            // Fallback: assign by position — index maps to the variant at that index,
            // tagged with its unique styleName.
            const uniqueCols = [...new Set(positions.map(p => p.col))].sort((a, b) => a - b)
            const uniqueRows = [...new Set(positions.map(p => p.row))].sort((a, b) => a - b)
            if (uniqueRows.length >= uniqueCols.length) {
              for (const pos of positions) {
                const idx = uniqueRows.indexOf(pos.row)
                if (idx < variantList.length) imageColourMap.set(pos.file, String(variantList[idx].styleName || ''))
              }
            } else {
              const colsPerColour = Math.max(1, Math.round(uniqueCols.length / variantList.length))
              for (const pos of positions) {
                const colIdx = uniqueCols.indexOf(pos.col)
                const colourIdx = Math.floor(colIdx / colsPerColour)
                if (colourIdx < variantList.length) imageColourMap.set(pos.file, String(variantList[colourIdx].styleName || ''))
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
      // Upload in parallel batches — sheets carry 40+ photos and one-at-a-time
      // uploads were the main cause of the long wait. The server compresses each
      // image to WebP, so the stored/delivered files are much smaller too.
      const BATCH = 6
      let done = 0
      for (let i = 0; i < imagesToUpload.length; i += BATCH) {
        const batch = imagesToUpload.slice(i, i + BATCH)
        const results = await Promise.all(batch.map(async img => {
          const fd = new FormData()
          fd.append('file', new Blob([img.bytes as BlobPart], { type: img.mimeType }), img.name)
          fd.append('folder', product.id)
          try {
            const res = await fetch('/api/upload-image', { method: 'POST', body: fd })
            if (!res.ok) return { img, url: null as string | null }
            const { url } = await res.json()
            return { img, url: url as string }
          } catch {
            return { img, url: null as string | null }
          }
        }))
        for (const { img, url } of results) {
          if (!url) { errors.push(`Image failed: ${img.name}`); continue }
          fileRecords.push({
            product_id: product.id, name: img.name, file_url: url,
            file_type: img.mimeType, file_size: img.bytes.length,
            department: 'merchandising', uploaded_by: profile.id, colour_tag: img.colourTag,
          })
          images_uploaded++
        }
        done += batch.length
        setUploadProgress(`Uploading images (${Math.min(done, imagesToUpload.length)}/${imagesToUpload.length})...`)
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

      // Colour variants are merged server-side (by unique style name) in the
      // upload API, so every uploaded sheet adds/updates its own designs.

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

    // Save confirmed product name as the short name (via API — direct writes to
    // products are blocked by RLS).
    const finalName = confirmProductName.trim()
    if (finalName) {
      await fetch('/api/update-product-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, display_name: finalName }),
      }).catch(() => {})
    }

    await supabase.from('merchandising_data').update({
      ...attrForm, is_completed: becomingComplete, updated_by: profile.id,
    }).eq('product_id', product.id)

    // Hand off to BOM regardless of the current stage — this was gated on the
    // product already sitting at merchandising_completed, so submitting from an
    // earlier stage silently skipped both the advance and the BOM email.
    if (becomingComplete) {
      await supabase.rpc('advance_product_stage', {
        p_product_id: product.id,
        p_next_stage: 'bom_finalized',
        p_user_id: profile.id,
        p_action: 'submitted merchandising to BOM',
        p_department: 'merchandising',
      })
      const notified = await fetch('/api/notify-stage-advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, product_name: product.name, next_stage: 'bom_finalized' }),
      }).then(r => r.ok).catch(() => false)
      toast[notified ? 'success' : 'error'](
        notified ? 'Submitted to BOM — team notified by email' : 'Submitted to BOM, but the email failed to send',
      )
    }

    setSaving(false)
    router.refresh()
  }

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

      {/* Actions — export + hand off to BOM */}
      {showActions && (
        <Card>
          <CardContent className="py-3 flex items-center gap-3 flex-wrap">
            <a
              href={`/api/export-merchandising-techpack?product_id=${product.id}`}
              download
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export Excel
            </a>
            {data?.is_locked && (
              <span className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
                <Lock className="h-3 w-3" /> Stage Locked
              </span>
            )}
            {saveError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{saveError}</p>
            )}
            {!data?.is_completed && (
              <Button
                className="ml-auto bg-green-600 hover:bg-green-700"
                onClick={() => setConfirmOpen(true)}
                disabled={saving || !(data?.colour_variants && data.colour_variants.length > 0)}
                title={!(data?.colour_variants && data.colour_variants.length > 0) ? 'Upload the attribute Excel first' : 'Submit to the BOM team'}
              >
                <Send className="h-4 w-4" />
                Submit to BOM
              </Button>
            )}
            {data?.is_completed && (
              <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
                <CheckCircle2 className="h-4 w-4" /> Submitted to BOM
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {/* Colour-wise attribute sheets — each design with its name, specs & images.
          Replaces the separate Colours tab. */}
      {data?.colour_variants && data.colour_variants.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-800 mb-2">Colour-wise Attribute Sheets</h3>
          <ColourVariantsTab variants={data.colour_variants} files={files} profile={profile} productId={product.id} />
        </div>
      )}
      {/* Custom confirm with compulsory product name */}
      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl border border-gray-200 shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex flex-col items-center mb-4">
              <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center mb-2">
                <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 className="text-base font-semibold text-gray-900 text-center">Submit to BOM?</h3>
              <p className="text-sm text-gray-500 text-center mt-1">This advances the product to BOM and emails the BOM team the attribute Excel.</p>
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
                {saving ? 'Saving…' : 'Yes, Submit to BOM'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

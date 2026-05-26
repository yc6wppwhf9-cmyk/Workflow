'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Save, Plus, X, Upload, ExternalLink, Trash2, FileSpreadsheet, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_LABELS, BRANDS, CHANNELS, type ProductCategory, type Brand } from '@/lib/types'
import type { Product, Profile, DesignData, ProductFile } from '@/lib/types'
import { parseTechPackRows } from '@/lib/parse-techpack'

interface DesignTabProps {
  product: Product
  profile: Profile
  data: DesignData | null
  files: ProductFile[]
}

export function DesignTab({ product, profile, data, files }: DesignTabProps) {
  const router = useRouter()
  const isRoleAllowed = ['admin', 'design'].includes(profile.role)
  const canEditFields = !data?.is_locked && !data?.is_completed && isRoleAllowed
  const showActions = !data?.is_locked && isRoleAllowed

  const [form, setForm] = useState({
    channel:        data?.channel        || '',
    designer_name:  data?.designer_name  || '',
    sample_color:   data?.sample_color   || '',
    color_skus:     data?.color_skus     || [] as string[],
    unique_feature: data?.unique_feature || '',
    // Tech pack fields
    farma:          data?.farma          || '',
    season_year:    data?.season_year    || '',
    fabric:         data?.fabric         || '',
    lining:         data?.lining         || '',
    air_mesh:       data?.air_mesh       || '',
    zipper:         data?.zipper         || '',
    puller:         data?.puller         || '',
    patta_9mm:      data?.patta_9mm      || '',
    patta_1:        data?.patta_1        || '',
    patta_2:        data?.patta_2        || '',
    lader_lock:     data?.lader_lock     || '',
    branding:       data?.branding       || '',
    screen_print:   data?.screen_print   || '',
    digital_print:  data?.digital_print  || '',
    bartech:        data?.bartech        || '',
    re_sampling_by: data?.re_sampling_by || '',
    remarks:        data?.remarks        || '',
    add_on_1:       data?.add_on_1       || '',
    add_on_2:       data?.add_on_2       || '',
    add_on_3:       data?.add_on_3       || '',
    designer_sign:  data?.designer_sign  || '',
  })
  const [category, setCategory] = useState<ProductCategory | ''>(product.category || '')
  const [brand, setBrand] = useState<Brand | ''>(product.brand || '')
  const [newSku, setNewSku] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const illustrationRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadingName, setUploadingName] = useState('')

  const techPackRef = useRef<HTMLInputElement>(null)
  const [parsingTechPack, setParsing] = useState(false)
  const [techPackResult, setTechPackResult] = useState<{ filled: string[] } | null>(null)

  const designFiles = files.filter(f => f.department === 'design' && f.file_type?.startsWith('image/'))

  function F({ label, field, placeholder, mono }: { label: string; field: keyof typeof form; placeholder?: string; mono?: boolean }) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-gray-500">{label}</Label>
        <Input
          placeholder={placeholder || ''}
          value={(form[field] as string) || ''}
          onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
          disabled={!canEditFields}
          className={`h-8 text-sm ${mono ? 'font-mono' : ''}`}
        />
      </div>
    )
  }

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()

    await Promise.all([
      supabase.from('design_data').update({
        ...form,
        updated_by: profile.id,
      }).eq('product_id', product.id),
      supabase.from('products').update({
        ...(category && { category }),
        ...(brand && { brand }),
        updated_by: profile.id,
      }).eq('id', product.id),
    ])

    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: 'updated design data',
      department: 'design',
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); router.refresh() }, 2000)
  }

  async function markComplete() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('design_data').update({
      ...form,
      is_completed: !data?.is_completed,
      updated_by: profile.id,
    }).eq('product_id', product.id)
    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: data?.is_completed ? 'marked design as incomplete' : 'marked design as complete',
      department: 'design',
    })
    setSaving(false)
    router.refresh()
  }

  async function handleTechPackUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    setTechPackResult(null)

    try {
      const { read, utils } = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]
      const f = parseTechPackRows(rows)

      const filled: string[] = []
      const updates: Partial<typeof form> = {}

      const map: Array<[keyof typeof form, string, string]> = [
        ['designer_name',  f.designerName,  'Designer Name'],
        ['farma',          f.farma,         'Farma'],
        ['season_year',    f.seasonYear,     'Season Year'],
        ['fabric',         f.fabric,         'Fabric'],
        ['lining',         f.lining,         'Lining'],
        ['air_mesh',       f.airMesh,        'Air Mesh'],
        ['zipper',         f.zipper,         'Zipper'],
        ['puller',         f.puller,         'Puller'],
        ['patta_9mm',      f.patta9mm,       '9mm Patta'],
        ['patta_1',        f.patta1,         'Patta 1'],
        ['patta_2',        f.patta2,         'Patta 2'],
        ['lader_lock',     f.laderLock,      'Lader Lock'],
        ['branding',       f.branding,       'Branding'],
        ['screen_print',   f.screenPrint,    'Screen Print'],
        ['digital_print',  f.digitalPrint,   'Digital Print'],
        ['bartech',        f.bartech,        'Bartech'],
        ['re_sampling_by', f.reSamplingBy,   'Re-sampling By'],
        ['remarks',        f.remarks,        'Remarks'],
        ['add_on_1',       f.addOn1,         'Add On 1'],
        ['add_on_2',       f.addOn2,         'Add On 2'],
        ['add_on_3',       f.addOn3,         'Add On 3'],
        ['designer_sign',  f.designerSign,   'Designer Sign'],
      ]
      for (const [key, val, label] of map) {
        if (val) { (updates as Record<string, string>)[key] = val; filled.push(label) }
      }
      setForm(prev => ({ ...prev, ...updates }))

      if (f.styleName && (product.name === 'New Product' || product.name.startsWith('PROD-'))) {
        const supabase = createClient()
        await supabase.from('products').update({ name: f.styleName, updated_by: profile.id }).eq('id', product.id)
        filled.push(`Product name → ${f.styleName}`)
      }

      setTechPackResult({ filled })
    } catch {
      setTechPackResult({ filled: [] })
    }

    setParsing(false)
    if (techPackRef.current) techPackRef.current.value = ''
    router.refresh()
  }

  async function handleIllustrationUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return
    setUploading(true)
    const supabase = createClient()
    const ts = Date.now()
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]
      setUploadingName(file.name)
      const storagePath = `${product.id}/design_${ts}_${i}_${file.name}`
      const { error } = await supabase.storage.from('product-files').upload(storagePath, file, { upsert: true })
      if (!error) {
        await supabase.from('product_files').insert({
          product_id: product.id, name: file.name, file_url: storagePath,
          file_type: file.type, file_size: file.size,
          department: 'design', uploaded_by: profile.id,
        })
      }
    }
    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: `uploaded ${selectedFiles.length} illustration(s)`, department: 'design',
    })
    setUploading(false)
    setUploadingName('')
    if (illustrationRef.current) illustrationRef.current.value = ''
    router.refresh()
  }

  async function deleteFile(file: ProductFile) {
    const supabase = createClient()
    // Extract storage path from either a signed URL or a legacy public URL
    const url = file.file_url
    const parts = url.split('/product-files/')
    const storagePath = parts.length > 1 ? decodeURIComponent(parts[1].split('?')[0]) : null
    if (storagePath) {
      await supabase.storage.from('product-files').remove([storagePath])
    }
    await supabase.from('product_files').delete().eq('id', file.id)
    router.refresh()
  }

  return (
    <div className="max-w-3xl space-y-4">

      {/* Illustrations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Illustrations</CardTitle>
          {canEditFields && (
            <Button size="sm" variant="outline" onClick={() => illustrationRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? uploadingName || 'Uploading...' : 'Upload'}
            </Button>
          )}
          <input ref={illustrationRef} type="file" accept="image/*" multiple className="hidden" onChange={handleIllustrationUpload} />
        </CardHeader>
        <CardContent>
          {designFiles.length === 0 ? (
            <div
              className={`border-2 border-dashed rounded-xl py-10 text-center ${canEditFields ? 'border-gray-200 cursor-pointer hover:border-purple-300 hover:bg-purple-50 transition-colors' : 'border-gray-100'}`}
              onClick={() => canEditFields && illustrationRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 font-medium">Upload design illustrations</p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, GIF, WEBP supported</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                {designFiles.map(file => (
                  <div key={file.id} className="relative group rounded-lg overflow-hidden border border-gray-200 aspect-video bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={file.file_url} alt={file.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <a href={file.file_url} target="_blank" rel="noopener noreferrer"
                        className="h-7 w-7 rounded-full bg-white flex items-center justify-center hover:bg-gray-100"
                        onClick={e => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-gray-700" />
                      </a>
                      {canEditFields && (
                        <button className="h-7 w-7 rounded-full bg-white flex items-center justify-center hover:bg-red-50" onClick={() => deleteFile(file)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </button>
                      )}
                    </div>
                    <p className="absolute bottom-0 left-0 right-0 px-2 py-1 text-xs text-white bg-black/50 truncate opacity-0 group-hover:opacity-100 transition-opacity">{file.name}</p>
                  </div>
                ))}
              </div>
              {canEditFields && (
                <button onClick={() => illustrationRef.current?.click()}
                  className="w-full py-2 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:text-purple-500 hover:border-purple-300 transition-colors"
                >
                  + Add more illustrations
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tech Pack Upload */}
      {canEditFields && (
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-purple-900">Upload Tech Pack</p>
                  <p className="text-xs text-purple-700">Auto-fills all fields below from the design Excel</p>
                </div>
              </div>
              <Button size="sm" onClick={() => techPackRef.current?.click()} disabled={parsingTechPack} className="bg-purple-600 hover:bg-purple-700 shrink-0">
                {parsingTechPack ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {parsingTechPack ? 'Parsing...' : 'Upload Tech Pack'}
              </Button>
              <input ref={techPackRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleTechPackUpload} />
            </div>
            {techPackResult && (
              <div className="mt-3 pt-3 border-t border-purple-200">
                {techPackResult.filled.length > 0 ? (
                  <div className="flex items-start gap-2 text-purple-800">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-purple-600" />
                    <div className="text-xs space-y-1">
                      <p>Filled: {techPackResult.filled.join(', ')}. Review and save.</p>
                      <p className="text-purple-600">If the Excel has multiple colour variants, data is taken from the first variant. Adjust colour-specific fields (Fabric, Zipper, Branding, Bartech, Patta) as needed.</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-red-600">Could not extract data — check the file format.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Design Details</CardTitle>
          {data?.is_locked && (
            <span className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
              <Lock className="h-3 w-3" /> Stage Locked
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Product identity */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Product</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as ProductCategory)} disabled={!canEditFields}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(CATEGORY_LABELS) as [ProductCategory, string][]).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Brand</Label>
                <Select value={brand} onValueChange={(v) => setBrand(v as Brand)} disabled={!canEditFields}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select brand" /></SelectTrigger>
                  <SelectContent>
                    {BRANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Channel</Label>
                <Select value={form.channel} onValueChange={(v) => setForm(f => ({ ...f, channel: v }))} disabled={!canEditFields}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select channel" /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Header row — mirrors Excel row 2 */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tech Pack</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <F label="Designer Name" field="designer_name" />
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Style Name</Label>
                <Input value={product.name} disabled className="h-8 text-sm bg-gray-50 text-gray-500" />
              </div>
              <F label="Farma" field="farma" placeholder="e.g. DAYSTEP" mono />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <F label="Season Year" field="season_year" placeholder="e.g. 2026-2027" />
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Sample Color</Label>
                <Input placeholder="e.g. Midnight Black" value={form.sample_color}
                  onChange={e => setForm(f => ({ ...f, sample_color: e.target.value }))}
                  disabled={!canEditFields} className="h-8 text-sm" />
              </div>
            </div>
          </div>

          {/* Row 3: Fabric · Lining · Air Mesh */}
          <div className="grid grid-cols-3 gap-3">
            <F label="Fabric" field="fabric" placeholder="e.g. 600*600 PU-BLK" />
            <F label="Lining" field="lining" placeholder="e.g. PLN LGR" />
            <F label="Air Mesh" field="air_mesh" placeholder="YES / NO / NA" />
          </div>

          {/* Row 4: Zipper · Puller · 9mm Patta */}
          <div className="grid grid-cols-3 gap-3">
            <F label="Zipper" field="zipper" placeholder="e.g. 8 NO.-BLK" />
            <F label="Puller" field="puller" placeholder="e.g. PVC PRIO NEW-BLK" />
            <F label="9mm Patta" field="patta_9mm" placeholder="e.g. BLK+HANGER" />
          </div>

          {/* Row 5: Patta 1 · Patta 2 · Lader Lock */}
          <div className="grid grid-cols-3 gap-3">
            <F label="Patta 1" field="patta_1" placeholder='e.g. 0.75"-BLK' />
            <F label="Patta 2" field="patta_2" placeholder="e.g. NA" />
            <F label="Lader Lock" field="lader_lock" placeholder='e.g. 0.75"-BLK' />
          </div>

          {/* Row 6: Branding · Screen Print · Digital Print */}
          <div className="grid grid-cols-3 gap-3">
            <F label="Branding" field="branding" placeholder="e.g. PBR PRIO HOPE-BLK-RED" />
            <F label="Screen Print" field="screen_print" placeholder="YES / NO / NA" />
            <F label="Digital Print" field="digital_print" placeholder="YES / NO / NA" />
          </div>

          {/* Row 7: Bartech · Re-sampling By · Remarks */}
          <div className="grid grid-cols-3 gap-3">
            <F label="Bartech" field="bartech" placeholder="e.g. BLK" />
            <F label="Re-sampling By" field="re_sampling_by" />
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Remarks</Label>
              <Textarea placeholder="e.g. USE 600×600 PVC FABRIC IN BACK" value={form.remarks}
                onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                disabled={!canEditFields} rows={2} className="text-sm" />
            </div>
          </div>

          {/* Add-ons */}
          <div className="grid grid-cols-3 gap-3">
            <F label="Add On 1" field="add_on_1" />
            <F label="Add On 2" field="add_on_2" />
            <F label="Add On 3" field="add_on_3" />
          </div>

          {/* Designer Sign */}
          <div className="grid grid-cols-2 gap-3">
            <F label="Designer Sign" field="designer_sign" />
          </div>

          {/* Colour SKUs */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Colour SKUs</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.color_skus.map((sku, i) => (
                <span key={i} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full font-mono">
                  {sku}
                  {canEditFields && (
                    <button onClick={() => setForm(f => ({ ...f, color_skus: f.color_skus.filter((_, j) => j !== i) }))}>
                      <X className="h-3 w-3 hover:text-red-500" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {canEditFields && (
              <div className="flex gap-2">
                <Input placeholder="Add SKU..." value={newSku}
                  onChange={e => setNewSku(e.target.value.toUpperCase())}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newSku.trim()) {
                      setForm(f => ({ ...f, color_skus: [...f.color_skus, newSku.trim()] }))
                      setNewSku('')
                    }
                  }}
                  className="font-mono h-8 text-sm"
                />
                <Button type="button" variant="outline" size="icon" className="h-8 w-8"
                  onClick={() => { if (newSku.trim()) { setForm(f => ({ ...f, color_skus: [...f.color_skus, newSku.trim()] })); setNewSku('') } }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {/* Unique Feature / USP */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Unique Feature / USP</Label>
            <Textarea placeholder="Unique selling point or feature..."
              value={form.unique_feature}
              onChange={e => setForm(f => ({ ...f, unique_feature: e.target.value }))}
              disabled={!canEditFields} rows={3} className="text-sm" />
          </div>

          {saved && (
            <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">Changes saved.</p>
          )}
          {showActions && (
            <div className="flex items-center gap-3 pt-2">
              {canEditFields && (
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </Button>
              )}
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

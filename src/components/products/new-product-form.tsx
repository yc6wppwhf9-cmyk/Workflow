'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, Upload, X, Plus, FileSpreadsheet, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_LABELS, BRANDS, CHANNELS, type Profile, type ProductCategory, type Brand } from '@/lib/types'
import { parseTechPackRows } from '@/lib/parse-techpack'

interface NewProductFormProps {
  profile: Profile
}

const EMPTY = {
  name: '',
  category: 'junior-backpacks' as ProductCategory,
  brand: '' as Brand | '',
  channel: '',
  designer_name: '',
  sample_color: '',
  color_skus: [] as string[],
  unique_feature: '',
  farma: '',
  season_year: '',
  fabric: '',
  lining: '',
  air_mesh: '',
  zipper: '',
  puller: '',
  patta_9mm: '',
  patta_1: '',
  patta_2: '',
  lader_lock: '',
  branding: '',
  screen_print: '',
  digital_print: '',
  bartech: '',
  re_sampling_by: '',
  remarks: '',
  add_on_1: '',
  add_on_2: '',
  add_on_3: '',
  designer_sign: '',
}

export function NewProductForm({ profile }: NewProductFormProps) {
  const router = useRouter()
  const [form, setForm] = useState({ ...EMPTY })
  const [newSku, setNewSku] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const techPackRef = useRef<HTMLInputElement>(null)
  const [parsingTechPack, setParsing] = useState(false)
  const [techPackResult, setTechPackResult] = useState<{ filled: string[] } | null>(null)

  function F({ label, field, placeholder, mono }: { label: string; field: keyof typeof form; placeholder?: string; mono?: boolean }) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-gray-500">{label}</Label>
        <Input
          placeholder={placeholder || ''}
          value={(form[field] as string) || ''}
          onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
          className={`h-8 text-sm ${mono ? 'font-mono' : ''}`}
        />
      </div>
    )
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
      if (f.styleName) {
        updates.name = f.styleName
        filled.push(`Style Name → ${f.styleName}`)
      }
      setForm(prev => ({ ...prev, ...updates }))
      setTechPackResult({ filled })
    } catch {
      setTechPackResult({ filled: [] })
    }

    setParsing(false)
    if (techPackRef.current) techPackRef.current.value = ''
  }

  async function handleSave() {
    if (!form.category) { setError('Category is required'); return }
    setSaving(true)
    setError('')

    const supabase = createClient()

    const { data: product, error: productErr } = await supabase
      .from('products')
      .insert({
        name: form.name.trim() || 'New Product',
        sku: form.name.trim()
          ? form.name.trim().toUpperCase().replace(/\s+/g, '-').substring(0, 20)
          : `PROD-${Date.now().toString(36).toUpperCase()}`,
        category: form.category,
        ...(form.brand && { brand: form.brand }),
        created_by: profile.id,
        updated_by: profile.id,
      })
      .select()
      .single()

    if (productErr || !product) {
      setError(productErr?.message || 'Failed to create product')
      setSaving(false)
      return
    }

    const designFields = {
      channel:        form.channel        || null,
      designer_name:  form.designer_name  || null,
      sample_color:   form.sample_color   || null,
      color_skus:     form.color_skus.length > 0 ? form.color_skus : null,
      unique_feature: form.unique_feature || null,
      farma:          form.farma          || null,
      season_year:    form.season_year    || null,
      fabric:         form.fabric         || null,
      lining:         form.lining         || null,
      air_mesh:       form.air_mesh       || null,
      zipper:         form.zipper         || null,
      puller:         form.puller         || null,
      patta_9mm:      form.patta_9mm      || null,
      patta_1:        form.patta_1        || null,
      patta_2:        form.patta_2        || null,
      lader_lock:     form.lader_lock     || null,
      branding:       form.branding       || null,
      screen_print:   form.screen_print   || null,
      digital_print:  form.digital_print  || null,
      bartech:        form.bartech        || null,
      re_sampling_by: form.re_sampling_by || null,
      remarks:        form.remarks        || null,
      add_on_1:       form.add_on_1       || null,
      add_on_2:       form.add_on_2       || null,
      add_on_3:       form.add_on_3       || null,
      designer_sign:  form.designer_sign  || null,
      updated_by: profile.id,
    }

    const hasDesignData = Object.entries(designFields).some(([k, v]) =>
      k !== 'updated_by' && v !== null
    )
    if (hasDesignData) {
      await supabase.from('design_data').update(designFields).eq('product_id', product.id)
    }

    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: 'created product with design data',
      department: 'design',
    })

    router.push(`/products/${product.id}?tab=${profile.role === 'sales' ? 'sales' : 'design'}`)
    router.refresh()
  }

  return (
    <div className="max-w-3xl space-y-4">

      {/* Tech Pack Upload */}
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
                    <p className="text-purple-600">If the Excel has multiple colour variants, data is taken from the first variant. Adjust colour-specific fields as needed.</p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-red-600">Could not extract data — check the file format.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Design Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Product identity */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Product</p>
            <div className="mb-3 space-y-1.5">
              <Label className="text-xs text-gray-500">Style Name</Label>
              <Input
                placeholder="Leave blank — auto-filled from tech pack"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Category <span className="text-red-500">*</span></Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as ProductCategory }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(CATEGORY_LABELS) as [ProductCategory, string][]).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Brand</Label>
                <Select value={form.brand} onValueChange={v => setForm(f => ({ ...f, brand: v as Brand }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select brand" /></SelectTrigger>
                  <SelectContent>
                    {BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Channel</Label>
                <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select channel" /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Tech pack fields */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tech Pack</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <F label="Designer Name" field="designer_name" />
              <F label="Farma" field="farma" placeholder="e.g. DAYSTEP" mono />
              <F label="Season Year" field="season_year" placeholder="e.g. 2026-2027" />
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <F label="Sample Color" field="sample_color" placeholder="e.g. Midnight Black" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <F label="Fabric" field="fabric" placeholder="e.g. 600*600 PU-BLK" />
            <F label="Lining" field="lining" placeholder="e.g. PLN LGR" />
            <F label="Air Mesh" field="air_mesh" placeholder="YES / NO / NA" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <F label="Zipper" field="zipper" placeholder="e.g. 8 NO.-BLK" />
            <F label="Puller" field="puller" placeholder="e.g. PVC PRIO NEW-BLK" />
            <F label="9mm Patta" field="patta_9mm" placeholder="e.g. BLK+HANGER" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <F label="Patta 1" field="patta_1" placeholder='e.g. 0.75"-BLK' />
            <F label="Patta 2" field="patta_2" placeholder="e.g. NA" />
            <F label="Lader Lock" field="lader_lock" placeholder='e.g. 0.75"-BLK' />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <F label="Branding" field="branding" placeholder="e.g. PBR PRIO HOPE-BLK-RED" />
            <F label="Screen Print" field="screen_print" placeholder="YES / NO / NA" />
            <F label="Digital Print" field="digital_print" placeholder="YES / NO / NA" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <F label="Bartech" field="bartech" placeholder="e.g. BLK" />
            <F label="Re-sampling By" field="re_sampling_by" />
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Remarks</Label>
              <Textarea placeholder="e.g. USE 600×600 PVC FABRIC IN BACK" value={form.remarks}
                onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                rows={2} className="text-sm" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <F label="Add On 1" field="add_on_1" />
            <F label="Add On 2" field="add_on_2" />
            <F label="Add On 3" field="add_on_3" />
          </div>

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
                  <button type="button" onClick={() => setForm(f => ({ ...f, color_skus: f.color_skus.filter((_, j) => j !== i) }))}>
                    <X className="h-3 w-3 hover:text-red-500" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="Add SKU..." value={newSku}
                onChange={e => setNewSku(e.target.value.toUpperCase())}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newSku.trim()) {
                    e.preventDefault()
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
          </div>

          {/* Unique Feature */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Unique Feature / USP</Label>
            <Textarea placeholder="Unique selling point or feature..."
              value={form.unique_feature}
              onChange={e => setForm(f => ({ ...f, unique_feature: e.target.value }))}
              rows={3} className="text-sm" />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? 'Creating Product...' : 'Create Product'}
            </Button>
            <Button variant="outline" onClick={() => router.push('/products')}>
              Cancel
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  )
}

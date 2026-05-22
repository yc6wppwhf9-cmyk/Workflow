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
import { parseTechPackRows, buildSpecText } from '@/lib/parse-techpack'

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
    channel: data?.channel || '',
    designer_name: data?.designer_name || '',
    sample_color: data?.sample_color || '',
    color_skus: data?.color_skus || [] as string[],
    unique_feature: data?.unique_feature || '',
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
        const { data: { publicUrl } } = supabase.storage.from('product-files').getPublicUrl(storagePath)
        await supabase.from('product_files').insert({
          product_id: product.id,
          name: file.name,
          file_url: publicUrl,
          file_type: file.type,
          file_size: file.size,
          department: 'design',
          uploaded_by: profile.id,
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
      const fields = parseTechPackRows(rows)

      const filled: string[] = []
      const updates: Partial<typeof form> = {}

      if (fields.designerName) {
        updates.designer_name = fields.designerName
        filled.push('Designer Name')
      }
      const specText = buildSpecText(fields)
      if (specText) {
        updates.unique_feature = specText
        filled.push('Material Specs')
      }
      if (fields.farma && !form.color_skus.includes(fields.farma)) {
        updates.color_skus = [...form.color_skus, fields.farma]
        filled.push(`Farma code (${fields.farma})`)
      }

      setForm(f => ({ ...f, ...updates }))

      // If product name is a placeholder, update it from STYLE NAME
      if (fields.styleName && (product.name === 'New Product' || product.name.startsWith('PROD-'))) {
        const supabase = createClient()
        await supabase.from('products').update({ name: fields.styleName, updated_by: profile.id }).eq('id', product.id)
        filled.push(`Product name → ${fields.styleName}`)
      }

      setTechPackResult({ filled })
    } catch {
      setTechPackResult({ filled: [] })
    }

    setParsing(false)
    if (techPackRef.current) techPackRef.current.value = ''
  }

  async function deleteFile(file: ProductFile) {
    const supabase = createClient()
    const urlParts = file.file_url.split('/product-files/')
    if (urlParts[1]) {
      await supabase.storage.from('product-files').remove([decodeURIComponent(urlParts[1])])
    }
    await supabase.from('product_files').delete().eq('id', file.id)
    router.refresh()
  }

  return (
    <div className="max-w-2xl space-y-4">

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
                        <button
                          className="h-7 w-7 rounded-full bg-white flex items-center justify-center hover:bg-red-50"
                          onClick={() => deleteFile(file)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </button>
                      )}
                    </div>
                    <p className="absolute bottom-0 left-0 right-0 px-2 py-1 text-xs text-white bg-black/50 truncate opacity-0 group-hover:opacity-100 transition-opacity">{file.name}</p>
                  </div>
                ))}
              </div>
              {canEditFields && (
                <button
                  onClick={() => illustrationRef.current?.click()}
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
                  <p className="text-xs text-purple-700">Fills designer name, material specs, and farma code from the design Excel</p>
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
                    <p className="text-xs">Filled: {techPackResult.filled.join(', ')}. Review below and save.</p>
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
        <CardContent className="space-y-4">
          {/* Category · Brand · Channel */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ProductCategory)} disabled={!canEditFields}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(CATEGORY_LABELS) as [ProductCategory, string][]).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <Select value={brand} onValueChange={(v) => setBrand(v as Brand)} disabled={!canEditFields}>
                <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                <SelectContent>
                  {BRANDS.map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })} disabled={!canEditFields}>
                <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Designer Name</Label>
              <Input
                placeholder="Designer's name"
                value={form.designer_name}
                onChange={(e) => setForm({ ...form, designer_name: e.target.value })}
                disabled={!canEditFields}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sample Color</Label>
              <Input
                placeholder="e.g. Midnight Black"
                value={form.sample_color}
                onChange={(e) => setForm({ ...form, sample_color: e.target.value })}
                disabled={!canEditFields}
              />
            </div>
          </div>


          <div className="space-y-1.5">
            <Label>Color SKUs</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.color_skus.map((sku, i) => (
                <span key={i} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full font-mono">
                  {sku}
                  {canEditFields && (
                    <button onClick={() => setForm({ ...form, color_skus: form.color_skus.filter((_, j) => j !== i) })}>
                      <X className="h-3 w-3 hover:text-red-500" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {canEditFields && (
              <div className="flex gap-2">
                <Input
                  placeholder="Add SKU..."
                  value={newSku}
                  onChange={(e) => setNewSku(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newSku.trim()) {
                      setForm({ ...form, color_skus: [...form.color_skus, newSku.trim()] })
                      setNewSku('')
                    }
                  }}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (newSku.trim()) {
                      setForm({ ...form, color_skus: [...form.color_skus, newSku.trim()] })
                      setNewSku('')
                    }
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Unique Feature</Label>
            <Textarea
              placeholder="Describe the unique selling point or feature..."
              value={form.unique_feature}
              onChange={(e) => setForm({ ...form, unique_feature: e.target.value })}
              disabled={!canEditFields}
              rows={3}
            />
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

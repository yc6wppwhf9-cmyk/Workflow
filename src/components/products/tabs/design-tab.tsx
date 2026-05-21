'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Save, Plus, X, Upload, ExternalLink, Trash2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_LABELS, BRANDS, CHANNELS, type ProductCategory, type Brand } from '@/lib/types'
import type { Product, Profile, DesignData, ProductFile } from '@/lib/types'

interface DesignTabProps {
  product: Product
  profile: Profile
  data: DesignData | null
  files: ProductFile[]
}

export function DesignTab({ product, profile, data, files }: DesignTabProps) {
  const router = useRouter()
  const canEdit = !data?.is_locked && ['admin', 'design'].includes(profile.role)

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

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
    router.refresh()
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
          {canEdit && (
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
              className={`border-2 border-dashed rounded-xl py-10 text-center ${canEdit ? 'border-gray-200 cursor-pointer hover:border-purple-300 hover:bg-purple-50 transition-colors' : 'border-gray-100'}`}
              onClick={() => canEdit && illustrationRef.current?.click()}
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
                      {canEdit && (
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
              {canEdit && (
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
              <Select value={category} onValueChange={(v) => setCategory(v as ProductCategory)} disabled={!canEdit}>
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
              <Select value={brand} onValueChange={(v) => setBrand(v as Brand)} disabled={!canEdit}>
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
              <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })} disabled={!canEdit}>
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
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Sample Color</Label>
              <Input
                placeholder="e.g. Midnight Black"
                value={form.sample_color}
                onChange={(e) => setForm({ ...form, sample_color: e.target.value })}
                disabled={!canEdit}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Color SKUs</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.color_skus.map((sku, i) => (
                <span key={i} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full font-mono">
                  {sku}
                  {canEdit && (
                    <button onClick={() => setForm({ ...form, color_skus: form.color_skus.filter((_, j) => j !== i) })}>
                      <X className="h-3 w-3 hover:text-red-500" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {canEdit && (
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
              disabled={!canEdit}
              rows={3}
            />
          </div>

          {canEdit && (
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saved ? 'Saved!' : 'Save Changes'}
              </Button>
              <Button
                variant="outline"
                onClick={markComplete}
                disabled={saving}
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

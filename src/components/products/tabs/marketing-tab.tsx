'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Save, Plus, X, Upload, FileText, ImageIcon, Trash2, ExternalLink } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import type { Product, Profile, MarketingData, ProductFile } from '@/lib/types'

interface MarketingTabProps {
  product: Product
  profile: Profile
  data: MarketingData | null
  files: ProductFile[]
}

export function MarketingTab({ product, profile, data, files }: MarketingTabProps) {
  const router = useRouter()
  const isRoleAllowed = ['admin', 'marketing'].includes(profile.role)
  const canEditFields = !data?.is_locked && !data?.is_completed && isRoleAllowed
  const showActions = !data?.is_locked && isRoleAllowed

  const [form, setForm] = useState({
    product_features: data?.product_features || [] as string[],
    photoshoots: data?.photoshoots || '',
    hero_product: data?.hero_product || false,
    catalogs: data?.catalogs || [] as string[],
    launch_creatives: data?.launch_creatives || '',
  })
  const [newFeature, setNewFeature] = useState('')
  const [newCatalog, setNewCatalog] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Launch creative files
  const creativeInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadingName, setUploadingName] = useState('')

  const creativeFiles = files.filter(f => f.department === 'marketing')

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('marketing_data').update({ ...form, updated_by: profile.id }).eq('product_id', product.id)
    await supabase.from('activity_logs').insert({ product_id: product.id, user_id: profile.id, action: 'updated marketing data', department: 'marketing' })
    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); router.refresh() }, 2000)
  }

  async function markComplete() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('marketing_data').update({ ...form, is_completed: !data?.is_completed, updated_by: profile.id }).eq('product_id', product.id)
    setSaving(false)
    router.refresh()
  }

  function addToList(field: 'product_features' | 'catalogs', value: string) {
    if (!value.trim()) return
    setForm({ ...form, [field]: [...form[field], value.trim()] })
  }

  function removeFromList(field: 'product_features' | 'catalogs', index: number) {
    setForm({ ...form, [field]: form[field].filter((_, i) => i !== index) })
  }

  async function handleCreativeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return

    setUploading(true)
    const supabase = createClient()
    const ts = Date.now()

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]
      setUploadingName(file.name)
      const storagePath = `${product.id}/marketing_${ts}_${i}_${file.name}`
      const { error } = await supabase.storage.from('product-files').upload(storagePath, file, { upsert: true })
      if (!error) {
        await supabase.from('product_files').insert({
          product_id: product.id,
          name: file.name,
          file_url: storagePath,
          file_type: file.type,
          file_size: file.size,
          department: 'marketing',
          uploaded_by: profile.id,
        })
      }
    }

    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: `uploaded ${selectedFiles.length} launch creative(s)`, department: 'marketing',
    })

    setUploading(false)
    setUploadingName('')
    if (creativeInputRef.current) creativeInputRef.current.value = ''
    router.refresh()
  }

  async function deleteFile(file: ProductFile) {
    const supabase = createClient()
    const url = file.file_url
    const parts = url.split('/product-files/')
    const storagePath = parts.length > 1 ? decodeURIComponent(parts[1].split('?')[0]) : url
    if (!storagePath.startsWith('http')) {
      await supabase.storage.from('product-files').remove([storagePath])
    }
    await supabase.from('product_files').delete().eq('id', file.id)
    router.refresh()
  }

  function isPdf(file: ProductFile) {
    return file.file_type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  }

  function isImage(file: ProductFile) {
    return file.file_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)
  }

  function formatSize(bytes: number | null) {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  return (
    <div className="max-w-2xl space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Marketing Details</CardTitle>
          {data?.is_locked && (
            <span className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
              <Lock className="h-3 w-3" /> Stage Locked
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Hero product toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-200">
            <div>
              <p className="text-sm font-medium text-gray-900">Hero Product</p>
              <p className="text-xs text-gray-500">Feature this product prominently in campaigns</p>
            </div>
            <button
              onClick={() => canEditFields && setForm({ ...form, hero_product: !form.hero_product })}
              disabled={!canEditFields}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.hero_product ? 'bg-blue-600' : 'bg-gray-200'} disabled:opacity-50`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.hero_product ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Product features */}
          <div className="space-y-1.5">
            <Label>Product Features</Label>
            <div className="space-y-2 mb-2">
              {form.product_features.map((f, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-md px-3 py-2">
                  <span className="text-xs text-gray-500 font-medium w-4">{i + 1}.</span>
                  <span className="text-sm text-gray-800 flex-1">{f}</span>
                  {canEditFields && (
                    <button onClick={() => removeFromList('product_features', i)}>
                      <X className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {canEditFields && (
              <div className="flex gap-2">
                <Input placeholder="Add a feature..." value={newFeature} onChange={(e) => setNewFeature(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { addToList('product_features', newFeature); setNewFeature('') } }}
                />
                <Button type="button" variant="outline" size="icon" onClick={() => { addToList('product_features', newFeature); setNewFeature('') }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Photoshoot Notes</Label>
            <Textarea placeholder="Photoshoot requirements, angles, props..." value={form.photoshoots} onChange={(e) => setForm({ ...form, photoshoots: e.target.value })} disabled={!canEditFields} rows={3} />
          </div>

          <div className="space-y-1.5">
            <Label>Catalogs</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.catalogs.map((c, i) => (
                <span key={i} className="flex items-center gap-1 bg-yellow-50 text-yellow-700 text-xs px-2.5 py-1 rounded-full border border-yellow-200">
                  {c}
                  {canEditFields && <button onClick={() => removeFromList('catalogs', i)}><X className="h-3 w-3 hover:text-red-500" /></button>}
                </span>
              ))}
            </div>
            {canEditFields && (
              <div className="flex gap-2">
                <Input placeholder="Catalog name..." value={newCatalog} onChange={(e) => setNewCatalog(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { addToList('catalogs', newCatalog); setNewCatalog('') } }}
                />
                <Button type="button" variant="outline" size="icon" onClick={() => { addToList('catalogs', newCatalog); setNewCatalog('') }}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

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
                <Button variant="outline" onClick={markComplete} disabled={saving} className="text-green-600 border-green-200">
                  Mark Complete
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Launch Creatives */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Launch Creatives</CardTitle>
          {canEditFields && (
            <Button size="sm" variant="outline" onClick={() => creativeInputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? uploadingName || 'Uploading...' : 'Upload'}
            </Button>
          )}
          <input
            ref={creativeInputRef}
            type="file"
            accept="image/*,.pdf"
            multiple
            className="hidden"
            onChange={handleCreativeUpload}
          />
        </CardHeader>
        <CardContent>
          {creativeFiles.length === 0 ? (
            <div
              className={`border-2 border-dashed rounded-xl py-10 text-center ${canEditFields ? 'border-gray-200 cursor-pointer hover:border-blue-300 hover:bg-blue-50 transition-colors' : 'border-gray-100'}`}
              onClick={() => canEditFields && creativeInputRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 font-medium">Upload launch creatives</p>
              <p className="text-xs text-gray-400 mt-1">Images (JPG, PNG) and PDFs supported</p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Image grid */}
              {creativeFiles.filter(isImage).length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {creativeFiles.filter(isImage).map(file => (
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
              )}

              {/* PDF list */}
              {creativeFiles.filter(isPdf).map(file => (
                <div key={file.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50 group">
                  <div className="h-9 w-9 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                    {file.file_size && <p className="text-xs text-gray-400">{formatSize(file.file_size)}</p>}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a href={file.file_url} target="_blank" rel="noopener noreferrer"
                      className="h-7 w-7 rounded flex items-center justify-center hover:bg-gray-200 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-gray-500" />
                    </a>
                    {canEditFields && (
                      <button
                        className="h-7 w-7 rounded flex items-center justify-center hover:bg-red-50 transition-colors"
                        onClick={() => deleteFile(file)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {/* Other files (non-image, non-pdf) */}
              {creativeFiles.filter(f => !isImage(f) && !isPdf(f)).map(file => (
                <div key={file.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                  <div className="h-9 w-9 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                    <ImageIcon className="h-4 w-4 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                    {file.file_size && <p className="text-xs text-gray-400">{formatSize(file.file_size)}</p>}
                  </div>
                  <div className="flex gap-1">
                    <a href={file.file_url} target="_blank" rel="noopener noreferrer"
                      className="h-7 w-7 rounded flex items-center justify-center hover:bg-gray-200"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-gray-500" />
                    </a>
                    {canEditFields && (
                      <button className="h-7 w-7 rounded flex items-center justify-center hover:bg-red-50" onClick={() => deleteFile(file)}>
                        <Trash2 className="h-3.5 w-3.5 text-red-400" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {canEditFields && (
                <button
                  onClick={() => creativeInputRef.current?.click()}
                  className="w-full py-2 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:text-blue-500 hover:border-blue-300 transition-colors"
                >
                  + Add more files
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

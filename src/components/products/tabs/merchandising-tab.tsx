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

    const fd = new FormData()
    fd.append('file', file)
    fd.append('product_id', product.id)
    fd.append('product_name', product.name)

    const res = await fetch('/api/upload-merch-excel', { method: 'POST', body: fd })
    const json = await res.json()

    if (json.success) {
      setUploadResult(json.results)
      router.refresh()
    } else {
      setUploadResult({
        skus_found: 0, skus_matched: 0, colors_found: [], other_products_in_file: [],
        bom_items_found: 0, images_uploaded: 0, fields_updated: [], errors: [json.error || 'Upload failed'],
      })
    }

    setUploading(false)
    if (excelInputRef.current) excelInputRef.current.value = ''
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
              <Button
                size="sm"
                onClick={() => excelInputRef.current?.click()}
                disabled={uploading}
                className="bg-green-600 hover:bg-green-700 shrink-0"
              >
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? 'Processing...' : 'Upload Excel'}
              </Button>
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

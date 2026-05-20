'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Save, Plus, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import type { Product, Profile, MarketingData } from '@/lib/types'

interface MarketingTabProps {
  product: Product
  profile: Profile
  data: MarketingData | null
}

export function MarketingTab({ product, profile, data }: MarketingTabProps) {
  const router = useRouter()
  const canEdit = !data?.is_locked && ['admin', 'marketing'].includes(profile.role)

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

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('marketing_data').update({ ...form, updated_by: profile.id }).eq('product_id', product.id)
    await supabase.from('activity_logs').insert({ product_id: product.id, user_id: profile.id, action: 'updated marketing data', department: 'marketing' })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
    router.refresh()
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
              onClick={() => canEdit && setForm({ ...form, hero_product: !form.hero_product })}
              disabled={!canEdit}
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
                  {canEdit && (
                    <button onClick={() => removeFromList('product_features', i)}>
                      <X className="h-3.5 w-3.5 text-gray-400 hover:text-red-500" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {canEdit && (
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
            <Textarea placeholder="Photoshoot requirements, angles, props..." value={form.photoshoots} onChange={(e) => setForm({ ...form, photoshoots: e.target.value })} disabled={!canEdit} rows={3} />
          </div>

          <div className="space-y-1.5">
            <Label>Catalogs</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.catalogs.map((c, i) => (
                <span key={i} className="flex items-center gap-1 bg-yellow-50 text-yellow-700 text-xs px-2.5 py-1 rounded-full border border-yellow-200">
                  {c}
                  {canEdit && <button onClick={() => removeFromList('catalogs', i)}><X className="h-3 w-3 hover:text-red-500" /></button>}
                </span>
              ))}
            </div>
            {canEdit && (
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

          <div className="space-y-1.5">
            <Label>Launch Creatives</Label>
            <Textarea placeholder="Creative brief, assets needed..." value={form.launch_creatives} onChange={(e) => setForm({ ...form, launch_creatives: e.target.value })} disabled={!canEdit} rows={3} />
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

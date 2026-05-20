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
import type { Product, Profile, DesignData } from '@/lib/types'

interface DesignTabProps {
  product: Product
  profile: Profile
  data: DesignData | null
}

export function DesignTab({ product, profile, data }: DesignTabProps) {
  const router = useRouter()
  const canEdit = !data?.is_locked && ['admin', 'design'].includes(profile.role)

  const [form, setForm] = useState({
    channel: data?.channel || '',
    designer_name: data?.designer_name || '',
    sample_color: data?.sample_color || '',
    color_skus: data?.color_skus || [] as string[],
    unique_feature: data?.unique_feature || '',
  })
  const [newSku, setNewSku] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()

    await supabase.from('design_data').update({
      ...form,
      updated_by: profile.id,
    }).eq('product_id', product.id)

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

  return (
    <div className="max-w-2xl space-y-4">
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Input
                placeholder="e.g. Retail, Online, Export"
                value={form.channel}
                onChange={(e) => setForm({ ...form, channel: e.target.value })}
                disabled={!canEdit}
              />
            </div>
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

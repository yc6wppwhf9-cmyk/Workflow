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

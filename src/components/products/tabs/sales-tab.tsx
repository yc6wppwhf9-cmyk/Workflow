'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import type { Product, Profile, SalesData } from '@/lib/types'

interface SalesTabProps {
  product: Product
  profile: Profile
  data: SalesData | null
}

const LAUNCH_STATUSES = ['Planned', 'In Progress', 'Launched', 'Paused', 'Discontinued']

export function SalesTab({ product, profile, data }: SalesTabProps) {
  const router = useRouter()
  const canEdit = !data?.is_locked && ['admin', 'sales'].includes(profile.role)

  const [form, setForm] = useState({
    mrp: data?.mrp?.toString() || '',
    dealer_pricing: data?.dealer_pricing?.toString() || '',
    launch_status: data?.launch_status || '',
    launch_date: data?.launch_date || '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const margin = form.mrp && form.dealer_pricing
    ? Math.round(((parseFloat(form.mrp) - parseFloat(form.dealer_pricing)) / parseFloat(form.mrp)) * 100)
    : null

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()

    await supabase.from('sales_data').update({
      mrp: form.mrp ? parseFloat(form.mrp) : null,
      dealer_pricing: form.dealer_pricing ? parseFloat(form.dealer_pricing) : null,
      launch_status: form.launch_status,
      launch_date: form.launch_date || null,
      updated_by: profile.id,
    }).eq('product_id', product.id)

    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: 'updated sales data',
      department: 'sales',
    })

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    setSaving(false)
    router.refresh()
  }

  async function markComplete() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('sales_data').update({
      mrp: form.mrp ? parseFloat(form.mrp) : null,
      dealer_pricing: form.dealer_pricing ? parseFloat(form.dealer_pricing) : null,
      launch_status: form.launch_status,
      launch_date: form.launch_date || null,
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
          <CardTitle className="text-base">Sales Details</CardTitle>
          {data?.is_locked && (
            <span className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
              <Lock className="h-3 w-3" /> Stage Locked
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>MRP (₹)</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={form.mrp}
                onChange={(e) => setForm({ ...form, mrp: e.target.value })}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Dealer Pricing (₹)</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={form.dealer_pricing}
                onChange={(e) => setForm({ ...form, dealer_pricing: e.target.value })}
                disabled={!canEdit}
              />
            </div>
          </div>

          {margin !== null && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm">
              <span className="text-gray-600">Dealer margin: </span>
              <span className="font-semibold text-green-700">{margin}%</span>
              {form.mrp && form.dealer_pricing && (
                <span className="text-gray-500 ml-2">
                  ({formatCurrency(parseFloat(form.mrp) - parseFloat(form.dealer_pricing))} per unit)
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Launch Status</Label>
              <Select value={form.launch_status} onValueChange={(v) => setForm({ ...form, launch_status: v })} disabled={!canEdit}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent>
                  {LAUNCH_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Launch Date</Label>
              <Input
                type="date"
                value={form.launch_date}
                onChange={(e) => setForm({ ...form, launch_date: e.target.value })}
                disabled={!canEdit}
              />
            </div>
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
                {data?.is_completed ? 'Mark Incomplete' : 'Mark Pricing Complete'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { CHANNELS, CATEGORY_LABELS, type Product, type Profile, type SalesData, type ProductCategory } from '@/lib/types'

interface SalesTabProps {
  product: Product
  profile: Profile
  data: SalesData | null
}

export function SalesTab({ product, profile, data }: SalesTabProps) {
  const router = useRouter()
  const isRoleAllowed = ['admin', 'sales'].includes(profile.role)
  const canEditFields = !data?.is_locked && !data?.is_completed && isRoleAllowed
  const showActions = !data?.is_locked && isRoleAllowed

  const [form, setForm] = useState({
    assign_to: data?.assign_to || '',
    channel: data?.channel || '',
    category: product.category || '',
    price_range: data?.price_range || '',
    deadline_date: data?.deadline_date || '',
    product_specification: data?.product_specification || '',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function set(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()

    await Promise.all([
      supabase.from('sales_data').update({
        assign_to: form.assign_to || null,
        channel: form.channel || null,
        price_range: form.price_range || null,
        deadline_date: form.deadline_date || null,
        product_specification: form.product_specification || null,
        updated_by: profile.id,
      }).eq('product_id', product.id),

      form.category
        ? supabase.from('products').update({ category: form.category, updated_by: profile.id }).eq('id', product.id)
        : Promise.resolve(),
    ])

    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: 'updated sales requirement',
      department: 'sales',
    })

    setSaving(false)
    setSaved(true)
    setTimeout(() => { setSaved(false); router.refresh() }, 2000)
  }

  async function markComplete() {
    setSaving(true)
    const supabase = createClient()
    await supabase.from('sales_data').update({
      assign_to: form.assign_to || null,
      channel: form.channel || null,
      price_range: form.price_range || null,
      deadline_date: form.deadline_date || null,
      product_specification: form.product_specification || null,
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
          <CardTitle className="text-base">Sales Requirement</CardTitle>
          {data?.is_locked && (
            <span className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
              <Lock className="h-3 w-3" /> Stage Locked
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Row 1: Assign To + Channel */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Assign To</Label>
              <Input
                placeholder="Designer / team member name"
                value={form.assign_to}
                onChange={e => set('assign_to', e.target.value)}
                disabled={!canEditFields}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Select value={form.channel} onValueChange={v => set('channel', v)} disabled={!canEditFields}>
                <SelectTrigger>
                  <SelectValue placeholder="Select channel..." />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: Category + Price Range */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onValueChange={v => set('category', v)} disabled={!canEditFields}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Price Range (₹)</Label>
              <Input
                placeholder="e.g. 500 – 1500"
                value={form.price_range}
                onChange={e => set('price_range', e.target.value)}
                disabled={!canEditFields}
              />
            </div>
          </div>

          {/* Deadline Date */}
          <div className="space-y-1.5">
            <Label>Deadline Date</Label>
            <Input
              type="date"
              value={form.deadline_date}
              onChange={e => set('deadline_date', e.target.value)}
              disabled={!canEditFields}
              className="w-48"
            />
          </div>

          {/* Product Specification */}
          <div className="space-y-1.5">
            <Label>Product Specification</Label>
            <Textarea
              placeholder="Describe the product requirements, features, target customer, and any specific details..."
              value={form.product_specification}
              onChange={e => set('product_specification', e.target.value)}
              disabled={!canEditFields}
              rows={5}
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
              <Button
                variant="outline"
                onClick={markComplete}
                disabled={saving}
                className={data?.is_completed ? 'text-orange-600 border-orange-200' : 'text-green-600 border-green-200'}
              >
                {data?.is_completed ? 'Mark Incomplete' : 'Mark Sales Complete'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

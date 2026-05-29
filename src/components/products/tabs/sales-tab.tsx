'use client'

import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useRouter } from 'next/navigation'
import { Loader2, Lock, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { DateInput } from '@/components/ui/date-input'
import { CHANNELS, CATEGORY_LABELS, type Product, type Profile, type SalesData, type ProductCategory } from '@/lib/types'

interface SalesTabProps {
  product: Product
  profile: Profile
  data: SalesData | null
}

function ReadOnlyField({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value || <span className="text-gray-400 italic">Not specified</span>}</p>
    </div>
  )
}

export function SalesTab({ product, profile, data }: SalesTabProps) {
  const router = useRouter()
  const isRoleAllowed = ['admin', 'sales'].includes(profile.role)
  const canEditFields = !data?.is_locked && !data?.is_completed && isRoleAllowed
  const showActions = !data?.is_locked && isRoleAllowed

  // Non-sales/admin roles see a clean read-only summary
  if (!isRoleAllowed) {
    const deadlineFormatted = data?.deadline_date
      ? new Date(data.deadline_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : null
    return (
      <div className="max-w-2xl">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center justify-between">
              Sales Requirement
              {data?.is_completed && (
                <span className="text-xs font-normal text-green-700 bg-green-100 px-2.5 py-1 rounded-full border border-green-200">Sales Complete</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-4">
            <ReadOnlyField label="Channel"       value={data?.channel} />
            <ReadOnlyField label="Price Range"   value={data?.price_range ? `₹${data.price_range}` : null} />
            <ReadOnlyField label="Category"      value={product.category} />
            <ReadOnlyField label="Deadline"      value={deadlineFormatted} />
            <div className="col-span-2">
              <ReadOnlyField label="Product Specification" value={data?.product_specification} />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

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
  const [confirmOpen, setConfirmOpen] = useState(false)

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
    const becomingComplete = !data?.is_completed
    setSaving(true)
    const supabase = createClient()
    await supabase.from('sales_data').update({
      assign_to: form.assign_to || null,
      channel: form.channel || null,
      price_range: form.price_range || null,
      deadline_date: form.deadline_date || null,
      product_specification: form.product_specification || null,
      is_completed: becomingComplete,
      updated_by: profile.id,
    }).eq('product_id', product.id)

    if (becomingComplete && product.workflow_stage === 'draft') {
      await supabase.rpc('advance_product_stage', {
        p_product_id: product.id,
        p_next_stage: 'design_completed',
        p_user_id: profile.id,
        p_action: 'marked sales complete — stage advanced to Design',
        p_department: 'sales',
      })
      fetch('/api/notify-stage-advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, product_name: product.name, next_stage: 'design_completed' }),
      }).catch(() => {})
    }

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
            <DateInput
              value={form.deadline_date}
              onChange={v => set('deadline_date', v)}
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
              {!data?.is_completed && (
                <Button variant="outline" onClick={() => setConfirmOpen(true)} disabled={saving} className="text-green-600 border-green-200">
                  Mark Sales Complete
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmOpen}
        title="Send Requirements to Design?"
        description="Requirements will be locked and the design team will be notified to begin work on this product."
        confirmLabel="Yes, Send to Design"
        loading={saving}
        onConfirm={() => { setConfirmOpen(false); markComplete() }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

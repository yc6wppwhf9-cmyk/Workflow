'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_LABELS, BRANDS, CHANNELS, type Profile, type ProductCategory, type Brand } from '@/lib/types'

interface NewProductFormProps {
  profile: Profile
}

const EMPTY = {
  name: '',
  category: 'junior-backpacks' as ProductCategory,
  brand: '' as Brand | '',
  channel: '',
  assign_to: '',
  price_range: '',
  deadline_date: '',
  product_specification: '',
}

export function NewProductForm({ profile }: NewProductFormProps) {
  const router = useRouter()
  const [form, setForm] = useState({ ...EMPTY })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!form.category) { setError('Category is required'); return }
    setSaving(true)
    setError('')

    const supabase = createClient()

    const { data: product, error: productErr } = await supabase
      .from('products')
      .insert({
        name: form.name.trim() || 'New Product',
        sku: form.name.trim()
          ? form.name.trim().toUpperCase().replace(/\s+/g, '-').substring(0, 20)
          : `PROD-${Date.now().toString(36).toUpperCase()}`,
        category: form.category,
        ...(form.brand && { brand: form.brand }),
        created_by: profile.id,
        updated_by: profile.id,
      })
      .select()
      .single()

    if (productErr || !product) {
      setError(productErr?.message || 'Failed to create product')
      setSaving(false)
      return
    }

    await supabase.from('sales_data').update({
      assign_to:             form.assign_to             || null,
      channel:               form.channel               || null,
      price_range:           form.price_range           || null,
      deadline_date:         form.deadline_date         || null,
      product_specification: form.product_specification || null,
      updated_by: profile.id,
    }).eq('product_id', product.id)

    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: 'created product with sales requirement',
      department: 'sales',
    })

    router.push(`/products/${product.id}?tab=sales`)
    router.refresh()
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="grid grid-cols-2 gap-4">

        {/* LEFT — Product identity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Product</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Product Name</Label>
              <Input
                placeholder="e.g. HELIX 005"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category <span className="text-red-500">*</span></Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as ProductCategory }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(CATEGORY_LABELS) as [ProductCategory, string][]).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <Select value={form.brand} onValueChange={v => setForm(f => ({ ...f, brand: v as Brand }))}>
                <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                <SelectContent>
                  {BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Select value={form.channel} onValueChange={v => setForm(f => ({ ...f, channel: v }))}>
                <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT — Sales requirement */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sales Requirement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Assign To</Label>
              <Input
                placeholder="Designer / team member name"
                value={form.assign_to}
                onChange={e => setForm(f => ({ ...f, assign_to: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Price Range</Label>
              <Input
                placeholder="e.g. ₹800 – ₹1200"
                value={form.price_range}
                onChange={e => setForm(f => ({ ...f, price_range: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Deadline Date</Label>
              <Input
                type="date"
                value={form.deadline_date}
                onChange={e => setForm(f => ({ ...f, deadline_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Product Specification</Label>
              <Textarea
                placeholder="Describe the product requirements, key features, target customer..."
                value={form.product_specification}
                onChange={e => setForm(f => ({ ...f, product_specification: e.target.value }))}
                rows={4}
                className="text-sm"
              />
            </div>
          </CardContent>
        </Card>

      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? 'Creating...' : 'Create Product'}
        </Button>
        <Button variant="outline" onClick={() => router.push('/products')}>Cancel</Button>
      </div>
    </div>
  )
}

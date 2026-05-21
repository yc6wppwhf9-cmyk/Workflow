'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_LABELS, BRANDS, CHANNELS, type Profile, type ProductCategory, type Brand } from '@/lib/types'

interface NewProductButtonProps {
  profile: Profile
}

const EMPTY_FORM = {
  // Product fields
  name: '',
  sku: '',
  category: 'junior-backpacks' as ProductCategory,
  brand: '' as Brand | '',
  // Design fields
  channel: '',
  designer_name: '',
  sample_color: '',
  color_skus: [] as string[],
  unique_feature: '',
}

export function NewProductButton({ profile }: NewProductButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [newSku, setNewSku] = useState('')
  const router = useRouter()

  if (!['admin', 'design'].includes(profile.role)) return null

  function addColorSku() {
    const v = newSku.trim().toUpperCase()
    if (v && !form.color_skus.includes(v)) {
      setForm(f => ({ ...f, color_skus: [...f.color_skus, v] }))
    }
    setNewSku('')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()

    // 1. Create the product
    const { data: product, error: productErr } = await supabase
      .from('products')
      .insert({
        name: form.name.trim() || form.sku,
        sku: form.sku,
        category: form.category,
        ...(form.brand && { brand: form.brand }),
        created_by: profile.id,
        updated_by: profile.id,
      })
      .select()
      .single()

    if (productErr || !product) {
      setError(productErr?.message || 'Failed to create product')
      setLoading(false)
      return
    }

    // 2. Populate design_data (created by DB trigger on product insert)
    const designFields = {
      channel: form.channel || null,
      designer_name: form.designer_name || null,
      sample_color: form.sample_color || null,
      color_skus: form.color_skus.length > 0 ? form.color_skus : null,
      unique_feature: form.unique_feature || null,
      updated_by: profile.id,
    }
    const hasDesignData = Object.values(designFields).some(v =>
      v !== null && v !== profile.id && !(Array.isArray(v) && v.length === 0)
    )
    if (hasDesignData) {
      await supabase.from('design_data').update(designFields).eq('product_id', product.id)
    }

    // 3. Log
    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: `created product "${form.name}"`,
      department: profile.role,
    })

    setOpen(false)
    setForm({ ...EMPTY_FORM })
    setNewSku('')
    router.push(`/products/${product.id}`)
    router.refresh()
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New Product
      </Button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm({ ...EMPTY_FORM }); setNewSku('') } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Product</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-5">

            {/* Product identity */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Product</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Product Name</Label>
                  <Input
                    id="name"
                    placeholder="Leave blank — will be set from the merchandising Excel"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sku">SKU *</Label>
                  <Input
                    id="sku"
                    placeholder="e.g. EXP-28L-BLK"
                    value={form.sku}
                    onChange={e => setForm(f => ({ ...f, sku: e.target.value.toUpperCase() }))}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Category *</Label>
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
              </div>
            </div>

            {/* Design details */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Design Details</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="space-y-1.5">
                  <Label>Designer Name</Label>
                  <Input
                    placeholder="e.g. Amrita Kumari"
                    value={form.designer_name}
                    onChange={e => setForm(f => ({ ...f, designer_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Sample Color</Label>
                  <Input
                    placeholder="e.g. Midnight Black"
                    value={form.sample_color}
                    onChange={e => setForm(f => ({ ...f, sample_color: e.target.value }))}
                  />
                </div>
              </div>

              <div className="space-y-1.5 mb-3">
                <Label>Color SKUs</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {form.color_skus.map((sku, i) => (
                    <span key={i} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full font-mono">
                      {sku}
                      <button type="button" onClick={() => setForm(f => ({ ...f, color_skus: f.color_skus.filter((_, j) => j !== i) }))}>
                        <X className="h-3 w-3 hover:text-red-500" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add SKU and press Enter..."
                    value={newSku}
                    onChange={e => setNewSku(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addColorSku() } }}
                    className="font-mono"
                  />
                  <Button type="button" variant="outline" onClick={addColorSku}>Add</Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Unique Feature</Label>
                <Textarea
                  placeholder="Describe the unique selling point or feature..."
                  value={form.unique_feature}
                  onChange={e => setForm(f => ({ ...f, unique_feature: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Product
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

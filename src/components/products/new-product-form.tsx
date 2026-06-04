'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save, ImagePlus, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { DateInput } from '@/components/ui/date-input'
import { CATEGORY_LABELS, CATEGORY_SUBCATEGORIES, BRANDS, CHANNELS, type Profile, type ProductCategory, type Brand } from '@/lib/types'

interface NewProductFormProps {
  profile: Profile
}

export function NewProductForm({ profile }: NewProductFormProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isDesignHead = profile.role === 'design_head'

  const [category, setCategory]   = useState<ProductCategory | ''>('')
  const [subCategory, setSubCategory] = useState('')

  function handleCategoryChange(val: ProductCategory | '') {
    setCategory(val)
    if (!val) { setSubCategory(''); return }
    const subs = CATEGORY_SUBCATEGORIES[val as ProductCategory] ?? []
    setSubCategory(subs.length === 1 ? subs[0] : '')
  }
  const [brand, setBrand]         = useState<Brand | ''>('')
  const [channel, setChannel]     = useState('')
  const [priceRange, setPriceRange]   = useState('')
  const [deadlineDate, setDeadlineDate] = useState('')
  const [productSpec, setProductSpec] = useState('')
  const [images, setImages]       = useState<File[]>([])
  const [previews, setPreviews]   = useState<string[]>([])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    const imgFiles = files.filter(f => f.type.startsWith('image/'))
    setImages(prev => [...prev, ...imgFiles])
    imgFiles.forEach(f => {
      const reader = new FileReader()
      reader.onload = ev => setPreviews(prev => [...prev, ev.target?.result as string])
      reader.readAsDataURL(f)
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeImage(idx: number) {
    setImages(prev => prev.filter((_, i) => i !== idx))
    setPreviews(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!category) { setError('Category is required'); return }
    const availableSubs = CATEGORY_SUBCATEGORIES[category as ProductCategory] ?? []
    if (availableSubs.length > 1 && !subCategory) { setError('Sub-category is required'); return }
    setSaving(true)
    setError('')

    const supabase = createClient()
    const autoName = `${category ? (CATEGORY_LABELS[category as ProductCategory] || category) : 'Product'}${brand ? ' ' + brand : ''} ${Date.now().toString(36).toUpperCase()}`
    const autoSku  = `PROD-${Date.now().toString(36).toUpperCase()}`

    const { data: product, error: productErr } = await supabase
      .from('products')
      .insert({
        name: autoName,
        sku: autoSku,
        ...(category && { category }),
        ...(subCategory && { sub_category: subCategory }),
        ...(brand && { brand }),
        created_by: profile.id,
        updated_by: profile.id,
        // Design-initiated products skip the sales/draft stage
        ...(isDesignHead && { workflow_stage: 'design_completed' }),
      })
      .select()
      .single()

    if (productErr || !product) {
      setError(productErr?.message || 'Failed to create product')
      setSaving(false)
      return
    }

    if (!isDesignHead) {
      await supabase.from('sales_data').update({
        channel:               channel               || null,
        price_range:           priceRange            || null,
        deadline_date:         deadlineDate          || null,
        product_specification: productSpec           || null,
        updated_by: profile.id,
      }).eq('product_id', product.id)
    } else if (deadlineDate) {
      await supabase.from('sales_data').update({
        deadline_date: deadlineDate,
        updated_by: profile.id,
      }).eq('product_id', product.id)
    }

    // Upload reference images
    if (images.length > 0) {
      const dept = isDesignHead ? 'design' : 'sales'
      const uploadPromises = images.map(async (file) => {
        const ext  = file.name.split('.').pop()
        const path = `${product.id}/${dept}/sample-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: storErr } = await supabase.storage.from('product-files').upload(path, file, { upsert: true })
        if (!storErr) {
          await supabase.from('product_files').insert({
            product_id:  product.id,
            name:        file.name,
            file_url:    path,
            file_type:   file.type,
            file_size:   file.size,
            department:  dept,
            uploaded_by: profile.id,
          })
        }
      })
      await Promise.allSettled(uploadPromises)
    }

    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: isDesignHead ? 'created product (design-initiated)' : 'created product with sales requirement',
      department: isDesignHead ? 'design' : 'sales',
    })

    // Notify design head when sales creates a new product
    if (!isDesignHead) {
      fetch('/api/notify-stage-advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, product_name: product.name, next_stage: 'design_completed' }),
      }).catch(() => {})
    }

    router.push(`/products/${product.id}?tab=design`)
    router.refresh()
  }

  return (
    <div className="max-w-2xl space-y-4">
      {isDesignHead && (
        <div className="rounded-lg bg-violet-50 border border-violet-200 px-4 py-2.5 text-sm text-violet-700">
          This product will go directly to the <strong>Design</strong> stage. Sales details (channel, deadline, pricing) can be filled in by the sales team later.
        </div>
      )}
      <div className={`grid gap-4 ${isDesignHead ? 'grid-cols-1 max-w-sm' : 'grid-cols-2'}`}>

        {/* LEFT — Product identity */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Product</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Category <span className="text-red-500">*</span></Label>
              <Select value={category} onValueChange={v => handleCategoryChange(v as ProductCategory)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(CATEGORY_LABELS) as [ProductCategory, string][]).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {category && (CATEGORY_SUBCATEGORIES[category as ProductCategory] ?? []).length > 1 && (
            <div className="space-y-1.5">
              <Label>Sub-Category <span className="text-red-500">*</span></Label>
              <Select value={subCategory} onValueChange={setSubCategory}>
                <SelectTrigger><SelectValue placeholder="Select sub-category" /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_SUBCATEGORIES[category as ProductCategory].map(sub => (
                    <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            )}
            <div className="space-y-1.5">
              <Label>Brand</Label>
              <Select value={brand} onValueChange={v => setBrand(v as Brand)}>
                <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                <SelectContent>
                  {BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!isDesignHead && (
            <div className="space-y-1.5">
              <Label>Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                <SelectContent>
                  {CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            )}

            {isDesignHead && (
            <div className="space-y-1.5">
              <Label>Deadline Date</Label>
              <DateInput value={deadlineDate} onChange={setDeadlineDate} />
            </div>
            )}

            {/* Reference images upload */}
            <div className="space-y-1.5">
              <Label>Reference Images</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageSelect}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-200 rounded-lg py-3 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
              >
                <ImagePlus className="h-4 w-4" />
                Click to upload images
              </button>
              {previews.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {previews.map((src, i) => (
                    <div key={i} className="relative group aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="w-full h-full object-cover rounded-md border border-gray-200" />
                      <button
                        type="button"
                        onClick={() => removeImage(i)}
                        className="absolute top-0.5 right-0.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* RIGHT — Sales requirement (hidden for design head) */}
        {!isDesignHead && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sales Requirement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Price Range</Label>
              <Input
                placeholder="e.g. ₹800 – ₹1200"
                value={priceRange}
                onChange={e => setPriceRange(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Deadline Date</Label>
              <DateInput value={deadlineDate} onChange={setDeadlineDate} />
            </div>
            <div className="space-y-1.5">
              <Label>Product Specification</Label>
              <Textarea
                placeholder="Describe the product requirements, key features, target customer..."
                value={productSpec}
                onChange={e => setProductSpec(e.target.value)}
                rows={6}
                className="text-sm"
              />
            </div>
          </CardContent>
        </Card>
        )}

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

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_LABELS, BRANDS, type Profile, type ProductCategory, type Brand } from '@/lib/types'

interface NewProductButtonProps {
  profile: Profile
}

const EMPTY_FORM = {
  name: '',
  category: 'junior-backpacks' as ProductCategory,
  brand: '' as Brand | '',
}

export function NewProductButton({ profile }: NewProductButtonProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const router = useRouter()

  if (!['admin', 'design'].includes(profile.role)) return null

  function handleClose() {
    setOpen(false)
    setForm({ ...EMPTY_FORM })
    setError('')
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
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
      setLoading(false)
      return
    }

    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: `created product`,
      department: profile.role,
    })

    handleClose()
    router.push(`/products/${product.id}?tab=design`)
    router.refresh()
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        New Product
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Product</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Product Name</Label>
              <Input
                id="name"
                placeholder="Leave blank — will be set from the tech pack"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
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
            </div>

            <p className="text-xs text-gray-400">
              All design details (tech pack, illustrations, colour SKUs) are filled in the Design tab after creation.
            </p>

            {error && (
              <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                Create & Open Design Tab
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

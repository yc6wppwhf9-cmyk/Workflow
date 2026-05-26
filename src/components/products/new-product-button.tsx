'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import type { Profile } from '@/lib/types'

interface NewProductButtonProps {
  profile: Profile
}

export function NewProductButton({ profile }: NewProductButtonProps) {
  const router = useRouter()
  const [creating, setCreating] = useState(false)

  if (!['admin', 'sales', 'design'].includes(profile.role)) return null

  // Sales: create instantly and open Sales tab directly
  async function handleSalesCreate() {
    setCreating(true)
    const supabase = createClient()
    const { data: product, error } = await supabase
      .from('products')
      .insert({
        name: 'New Product',
        sku: `PROD-${Date.now().toString(36).toUpperCase()}`,
        category: 'junior-backpacks',
        created_by: profile.id,
        updated_by: profile.id,
      })
      .select()
      .single()

    if (!error && product) {
      await supabase.from('activity_logs').insert({
        product_id: product.id,
        user_id: profile.id,
        action: 'created product',
        department: 'sales',
      })
      router.push(`/products/${product.id}?tab=sales`)
    }
    setCreating(false)
  }

  if (profile.role === 'sales') {
    return (
      <Button onClick={handleSalesCreate} disabled={creating}>
        {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        New Product
      </Button>
    )
  }

  return (
    <Button onClick={() => router.push('/products/new')}>
      <Plus className="h-4 w-4" />
      New Product
    </Button>
  )
}

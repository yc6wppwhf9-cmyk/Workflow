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
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  if (!['admin', 'design'].includes(profile.role)) return null

  async function handleCreate() {
    setLoading(true)
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

    if (error || !product) {
      setLoading(false)
      return
    }

    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: 'created product',
      department: profile.role,
    })

    router.push(`/products/${product.id}?tab=design`)
    router.refresh()
  }

  return (
    <Button onClick={handleCreate} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      {loading ? 'Creating...' : 'New Product'}
    </Button>
  )
}

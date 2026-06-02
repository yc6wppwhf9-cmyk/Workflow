'use client'

import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Profile } from '@/lib/types'

interface NewProductButtonProps {
  profile: Profile
}

export function NewProductButton({ profile }: NewProductButtonProps) {
  const router = useRouter()

  if (!['admin', 'sales', 'design_head'].includes(profile.role)) return null

  return (
    <Button onClick={() => router.push('/products/new')}>
      <Plus className="h-4 w-4" />
      New Product
    </Button>
  )
}

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, UserCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

interface AssignToMeButtonProps {
  productId: string
  profileId: string
}

export function AssignToMeButton({ productId, profileId }: AssignToMeButtonProps) {
  const router  = useRouter()
  const [busy, setBusy] = useState(false)

  async function assign() {
    setBusy(true)
    const supabase = createClient()
    await supabase.from('design_data')
      .update({ assigned_to: profileId, updated_by: profileId })
      .eq('product_id', productId)
    await supabase.from('activity_logs').insert({
      product_id: productId,
      user_id:    profileId,
      action:     'self-assigned design task',
      department: 'design',
    })
    setBusy(false)
    router.refresh()
  }

  return (
    <Button size="sm" onClick={assign} disabled={busy} className="h-7 text-xs">
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
      Assign to me
    </Button>
  )
}

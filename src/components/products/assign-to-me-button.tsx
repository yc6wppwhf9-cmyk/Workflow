'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
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

    // Only update if still unassigned — prevents silent overwrite when two designers race
    const { count } = await supabase.from('design_data')
      .select('*', { count: 'exact', head: true })
      .eq('product_id', productId)
      .not('assigned_to', 'is', null)

    if (count && count > 0) {
      toast.error('This product was just claimed by someone else.')
      setBusy(false)
      router.refresh()
      return
    }

    const { error } = await supabase.from('design_data')
      .update({ assigned_to: profileId, updated_by: profileId })
      .eq('product_id', productId)
      .is('assigned_to', null)   // atomic guard — only proceeds if still unassigned

    if (error) {
      toast.error('Could not assign — please try again.')
      setBusy(false)
      router.refresh()
      return
    }

    await supabase.from('activity_logs').insert({
      product_id: productId,
      user_id:    profileId,
      action:     'self-assigned design task',
      department: 'design',
    })
    toast.success('Product assigned to you.')
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

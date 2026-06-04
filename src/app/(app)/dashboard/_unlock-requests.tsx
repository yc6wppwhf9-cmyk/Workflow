'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Unlock, X, Loader2 } from 'lucide-react'
import { WORKFLOW_STAGES, STAGE_LABELS, type WorkflowStage } from '@/lib/types'

export type UnlockRequest = {
  id: string
  product_id: string
  stage: WorkflowStage
  reason: string | null
  created_at: string
  requesterName: string | null
  productName: string | null
}

export function UnlockRequestsPanel({
  requests,
  adminId,
}: {
  requests: UnlockRequest[]
  adminId: string
}) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  if (requests.length === 0) return null

  const supabase = createClient()

  async function approve(req: UnlockRequest) {
    const idx = WORKFLOW_STAGES.indexOf(req.stage)
    const prevStage = idx > 0 ? WORKFLOW_STAGES[idx - 1] : null
    if (!prevStage) {
      setErrors(e => ({ ...e, [req.id]: 'Cannot unlock from the first stage.' }))
      return
    }

    setLoading(req.id)
    setErrors(e => ({ ...e, [req.id]: '' }))

    const { error } = await supabase.rpc('unlock_product_stage', {
      p_product_id: req.product_id,
      p_prev_stage: prevStage,
      p_user_id: adminId,
      p_action: `unlocked stage back to "${STAGE_LABELS[prevStage]}" (request approved)`,
      p_department: 'admin',
    })

    if (error) {
      setErrors(e => ({ ...e, [req.id]: error.message }))
      setLoading(null)
      return
    }

    await supabase.from('stage_unlock_requests').update({
      status: 'approved',
      resolved_by: adminId,
      resolved_at: new Date().toISOString(),
    }).eq('id', req.id)

    setLoading(null)
    router.refresh()
  }

  async function dismiss(req: UnlockRequest) {
    setLoading(`d-${req.id}`)
    await supabase.from('stage_unlock_requests').update({
      status: 'dismissed',
      resolved_by: adminId,
      resolved_at: new Date().toISOString(),
    }).eq('id', req.id)
    setLoading(null)
    router.refresh()
  }

  return (
    <Card className="border-orange-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-orange-700">
          <Unlock className="h-4 w-4" /> Stage Unlock Requests ({requests.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.map(req => {
          const idx = WORKFLOW_STAGES.indexOf(req.stage)
          const prevStage = idx > 0 ? WORKFLOW_STAGES[idx - 1] : null
          return (
            <div key={req.id} className="flex items-start justify-between gap-4 border border-orange-100 rounded-lg p-3 bg-orange-50">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{req.productName || req.product_id}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  <span className="font-medium">{req.requesterName || 'Unknown'}</span>
                  {' wants to revert from '}
                  <span className="font-medium">{STAGE_LABELS[req.stage]}</span>
                  {prevStage && <>{' → '}<span className="font-medium">{STAGE_LABELS[prevStage]}</span></>}
                </p>
                {req.reason && (
                  <p className="text-xs text-orange-700 mt-1 italic">&ldquo;{req.reason}&rdquo;</p>
                )}
                {errors[req.id] && (
                  <p className="text-xs text-red-600 mt-1">{errors[req.id]}</p>
                )}
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => dismiss(req)}
                  disabled={loading !== null}
                  className="text-gray-500 border-gray-200 h-7 px-2"
                  title="Dismiss without unlocking"
                >
                  {loading === `d-${req.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                </Button>
                <Button
                  size="sm"
                  onClick={() => approve(req)}
                  disabled={loading !== null || !prevStage}
                  className="bg-orange-600 hover:bg-orange-700 h-7 px-3 text-xs"
                >
                  {loading === req.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3 mr-1" />}
                  Approve
                </Button>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}

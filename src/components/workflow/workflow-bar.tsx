'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Lock, ChevronRight, Unlock, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { WORKFLOW_STAGES, STAGE_LABELS, STAGE_OWNER_ROLE, type WorkflowStage, type Product, type Profile, type DesignData, type MerchandisingData, type BomData, type MarketingData, type SalesData } from '@/lib/types'
import { cn } from '@/lib/utils'

interface WorkflowBarProps {
  product: Product
  profile: Profile
  designData: DesignData | null
  merchandisingData: MerchandisingData | null
  bomData: BomData | null
  marketingData: MarketingData | null
  salesData: SalesData | null
}

export function WorkflowBar({
  product, profile, designData, merchandisingData,
  bomData, marketingData, salesData,
}: WorkflowBarProps) {
  const router = useRouter()
  const [advancing, setAdvancing] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [unlockReason, setUnlockReason] = useState('')
  const [unlockLoading, setUnlockLoading] = useState(false)

  const currentIndex = WORKFLOW_STAGES.indexOf(product.workflow_stage as WorkflowStage)
  const isAdmin = ['admin', 'management'].includes(profile.role)

  // 5 display stages matching the new hierarchy: Sales → Design → Merch → BOM → Marketing
  const DISPLAY_STAGES = [
    { label: 'Sales',         doneAfter: 0 },  // done when past draft
    { label: 'Design',        doneAfter: 1 },
    { label: 'Merchandising', doneAfter: 2 },
    { label: 'BOM',           doneAfter: 3 },
    { label: 'Marketing',     doneAfter: 4 },
  ]

  const isCurrentStageComplete = () => {
    switch (product.workflow_stage as WorkflowStage) {
      case 'draft':                  return salesData?.is_completed || false
      case 'design_completed':       return designData?.is_completed || false
      case 'merchandising_completed': return merchandisingData?.is_completed || false
      case 'bom_finalized':          return bomData?.is_completed || false
      case 'marketing_ready':        return marketingData?.is_completed || false
      default:                       return true
    }
  }

  const currentStageCompleted = isCurrentStageComplete()
  const isTerminal = currentIndex >= WORKFLOW_STAGES.length - 1
  const hasNextStage = !isTerminal

  const currentStageOwner = STAGE_OWNER_ROLE[product.workflow_stage as WorkflowStage]
  const isOwner = profile.role === currentStageOwner
    || (product.workflow_stage === 'design_completed' && profile.role === 'design_head')
  const canAdvance = (isAdmin || isOwner) && (currentStageCompleted || isAdmin)

  const prevStage = currentIndex > 0 ? WORKFLOW_STAGES[currentIndex - 1] : null

  async function advanceStage() {
    if (currentIndex >= WORKFLOW_STAGES.length - 1) return
    setAdvancing(true)

    const supabase = createClient()
    const nextStage = WORKFLOW_STAGES[currentIndex + 1]
    const actionText = `advanced stage to "${STAGE_LABELS[nextStage]}"`

    const { error: rpcError } = await supabase.rpc('advance_product_stage', {
      p_product_id: product.id,
      p_next_stage: nextStage,
      p_user_id: profile.id,
      p_action: actionText,
      p_department: profile.role
    })

    if (rpcError) {
      alert(`Could not advance stage: ${rpcError.message}`)
    } else {
      // Fire notification — non-blocking, don't await
      fetch('/api/notify-stage-advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, product_name: product.name, next_stage: nextStage }),
      }).catch(() => { /* notifications are best-effort */ })
    }

    router.refresh()
    setAdvancing(false)
  }

  async function requestUnlock() {
    if (currentIndex <= 0) return   // guard: cannot unlock below Draft
    setUnlockLoading(true)
    const supabase = createClient()

    if (isAdmin) {
      const actionText = `unlocked stage back to "${STAGE_LABELS[prevStage!]}"`
      const { error: rpcError } = await supabase.rpc('unlock_product_stage', {
        p_product_id: product.id,
        p_prev_stage: prevStage!,
        p_user_id: profile.id,
        p_action: actionText,
        p_department: 'admin'
      })
      if (rpcError) {
        alert(`Could not unlock stage: ${rpcError.message}`)
      }
    } else {
      await supabase.from('stage_unlock_requests').insert({
        product_id: product.id,
        stage: product.workflow_stage as WorkflowStage,
        requested_by: profile.id,
        reason: unlockReason,
      })
    }

    setUnlockOpen(false)
    setUnlockReason('')
    setUnlockLoading(false)
    router.refresh()
  }

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        {/* Stage progress — 6 display stages, draft maps to Design in-progress */}
        <div className="flex items-center gap-1 flex-wrap">
          {DISPLAY_STAGES.map((stage, i) => {
            const isDone = currentIndex > stage.doneAfter
            const isCurrent = currentIndex === stage.doneAfter
            const isFuture = currentIndex < stage.doneAfter

            return (
              <div key={stage.label} className="flex items-center gap-1">
                <div className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  isDone && 'bg-green-100 text-green-700',
                  isCurrent && 'bg-blue-600 text-white shadow-sm',
                  isFuture && 'bg-gray-100 text-gray-400',
                )}>
                  {isDone && <Check className="h-3 w-3" />}
                  {isCurrent && <div className="h-2 w-2 rounded-full bg-white" />}
                  {stage.label}
                </div>
                {i < DISPLAY_STAGES.length - 1 && (
                  <ChevronRight className={cn('h-3 w-3', isDone ? 'text-green-400' : 'text-gray-300')} />
                )}
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {!currentStageCompleted && (
            <div className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-lg font-medium">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              Pending department completion
            </div>
          )}

          <div className="flex items-center gap-2">
            {currentIndex > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUnlockOpen(true)}
                className="text-orange-600 border-orange-200 hover:bg-orange-50"
              >
                <Unlock className="h-3.5 w-3.5" />
                {isAdmin ? 'Unlock Stage' : 'Request Unlock'}
              </Button>
            )}
            {hasNextStage && (isAdmin || isOwner) && (
              <Button
                size="sm"
                onClick={advanceStage}
                disabled={advancing || !canAdvance}
                className={cn(!canAdvance && 'opacity-50 cursor-not-allowed')}
                title={!currentStageCompleted && !isAdmin ? 'Must mark department data as complete before advancing' : undefined}
              >
                {advancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
                Advance Stage
              </Button>
            )}
            {isTerminal && currentStageCompleted && (
              <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                <Check className="h-4 w-4" /> Pipeline Complete
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Unlock dialog */}
      <Dialog open={unlockOpen} onOpenChange={setUnlockOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{isAdmin ? 'Unlock Stage' : 'Request Stage Unlock'}</DialogTitle>
            <DialogDescription>
              {isAdmin
                ? 'This will move the product back to the previous stage.'
                : 'Your request will be sent to admin for approval.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-start gap-2 rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-700">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p>Current: <strong>{STAGE_LABELS[product.workflow_stage as WorkflowStage]}</strong></p>
                {isAdmin && prevStage && (
                  <p className="mt-0.5">Will revert to: <strong>{STAGE_LABELS[prevStage]}</strong></p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea
                placeholder="Why do you need to unlock this stage?"
                value={unlockReason}
                onChange={(e) => setUnlockReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUnlockOpen(false)}>Cancel</Button>
            <Button
              onClick={requestUnlock}
              disabled={unlockLoading || !unlockReason.trim()}
              variant="destructive"
              className="bg-orange-600 hover:bg-orange-700"
            >
              {unlockLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isAdmin ? 'Unlock' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

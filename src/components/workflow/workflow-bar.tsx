'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Check, ChevronRight, Unlock, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { WORKFLOW_STAGES, STAGE_LABELS, ownsStage, type WorkflowStage, type Product, type Profile, type DesignData, type SamplingData, type MerchandisingData, type BomData, type MarketingData } from '@/lib/types'
import { cn } from '@/lib/utils'

interface WorkflowBarProps {
  product: Product
  profile: Profile
  designData: DesignData | null
  samplingData: SamplingData | null
  merchandisingData: MerchandisingData | null
  bomData: BomData | null
  marketingData: MarketingData | null
  onTabChange?: (tab: string) => void
}

export function WorkflowBar({
  product, profile, designData, samplingData, merchandisingData,
  bomData, marketingData, onTabChange,
}: WorkflowBarProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [advancing, setAdvancing] = useState(false)
  const [advanceError, setAdvanceError] = useState<string | null>(null)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [unlockReason, setUnlockReason] = useState('')
  const [unlockLoading, setUnlockLoading] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)

  const currentIndex = WORKFLOW_STAGES.indexOf(product.workflow_stage as WorkflowStage)
  const isAdmin = ['admin', 'management'].includes(profile.role)

  // Chips map to stage NAMES, never to positions. The hardcoded indices this
  // replaces were written against an older WORKFLOW_STAGES and silently went
  // stale when the list changed shape: "Marketing" pointed at costing_naming, so
  // a product arriving at Marketing rendered as already past it, and the
  // marketing head was told the work was done before she had started.
  const DISPLAY_STAGES: { label: string; tab: string; stages: WorkflowStage[] }[] = [
    { label: 'Design',        tab: 'design',        stages: ['design_completed'] },
    { label: 'Sampling',      tab: 'sampling',      stages: ['sampling_completed'] },
    { label: 'Merchandising', tab: 'merchandising', stages: ['merchandising_completed'] },
    // costing_naming is retired but still set on older rows, and it was BOM's
    // work — fold it into the BOM chip so those products still light one up.
    { label: 'BOM',           tab: 'bom',           stages: ['bom_finalized', 'costing_naming'] },
    { label: 'Marketing',     tab: 'marketing',     stages: ['marketing_ready'] },
    { label: 'Sales Priced',  tab: 'sales',         stages: ['sales_priced'] },
  ]

  const isCurrentStageComplete = () => {
    switch (product.workflow_stage as WorkflowStage) {
      case 'design_completed':       return designData?.is_completed || false
      case 'sampling_completed':     return !!samplingData?.is_completed && samplingData.sample_review_status === 'approved'
      case 'merchandising_completed': return merchandisingData?.is_completed || false
      case 'bom_finalized':          return bomData?.is_completed || false
      // Legacy stage, retired from WORKFLOW_STAGES but still set on old rows.
      // Naming is optional, so only the MD costing approval marks it complete.
      case 'costing_naming':         return !!product.md_costing_approved
      case 'marketing_ready':        return marketingData?.is_completed || false
      default:                       return true
    }
  }

  const currentStageCompleted = isCurrentStageComplete()
  const isTerminal = currentIndex >= WORKFLOW_STAGES.length - 1
  const hasNextStage = !isTerminal

  // Heads own their department's stage alongside their team. This used to name
  // the member role and special-case design_head only, which left the other
  // heads unable to advance their own stage.
  const isOwner = ownsStage(profile.role, product.workflow_stage as WorkflowStage)
  const canAdvance = (isAdmin || isOwner) && (currentStageCompleted || isAdmin)

  const prevStage = currentIndex > 0 ? WORKFLOW_STAGES[currentIndex - 1] : null

  async function advanceStage() {
    if (currentIndex >= WORKFLOW_STAGES.length - 1) return
    setAdvancing(true)
    setAdvanceError(null)

    const nextStage = WORKFLOW_STAGES[currentIndex + 1]
    const { error: rpcError } = await supabase.rpc('advance_product_stage', {
      p_product_id: product.id,
      p_next_stage: nextStage,
      p_user_id: profile.id,
      p_action: `advanced stage to "${STAGE_LABELS[nextStage]}"`,
      p_department: profile.role,
    })

    if (rpcError) {
      setAdvanceError(rpcError.message)
      toast.error(`Stage advance failed: ${rpcError.message}`)
      setAdvancing(false)
      return
    }

    // Fire notification — non-blocking, best-effort
    fetch('/api/notify-stage-advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id, product_name: product.name, next_stage: nextStage }),
    }).catch(() => {})

    router.refresh()
    setAdvancing(false)
  }

  async function requestUnlock() {
    if (currentIndex <= 0) return
    setUnlockLoading(true)
    setUnlockError(null)

    if (isAdmin) {
      const { error: rpcError } = await supabase.rpc('unlock_product_stage', {
        p_product_id: product.id,
        p_prev_stage: prevStage!,
        p_user_id: profile.id,
        p_action: `unlocked stage back to "${STAGE_LABELS[prevStage!]}"`,
        p_department: 'admin',
      })
      if (rpcError) {
        setUnlockError(rpcError.message)
        setUnlockLoading(false)
        return
      }
    } else {
      await supabase.from('stage_unlock_requests').insert({
        product_id: product.id,
        stage: product.workflow_stage as WorkflowStage,
        requested_by: profile.id,
        reason: unlockReason,
      })
      toast.success('Unlock request submitted — admin will be notified.')
    }

    setUnlockOpen(false)
    setUnlockReason('')
    setUnlockLoading(false)
    router.refresh()
  }

  return (
    <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Stage progress — scrollable on mobile */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 sm:flex-wrap scrollbar-hide min-w-0">
          {DISPLAY_STAGES.map((stage, i) => {
            // A chip is current while the product sits on any stage it covers,
            // and done only once the product is past the last of them.
            const lastIndex = Math.max(...stage.stages.map(s => WORKFLOW_STAGES.indexOf(s)))
            const isCurrent = stage.stages.includes(product.workflow_stage as WorkflowStage)
            const isDone = !isCurrent && currentIndex > lastIndex
            const isFuture = !isCurrent && !isDone
            const isClickable = (isDone || isCurrent) && !!onTabChange

            return (
              <div key={stage.label} className="flex items-center gap-1 shrink-0">
                <div
                  onClick={() => isClickable && onTabChange(stage.tab)}
                  title={isClickable ? `Go to ${stage.label} tab` : undefined}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap',
                    isDone && 'bg-green-100 text-green-700',
                    isCurrent && 'bg-blue-600 text-white shadow-sm',
                    isFuture && 'bg-gray-100 text-gray-400',
                    isClickable && 'cursor-pointer hover:opacity-75 active:scale-95',
                    !isClickable && 'cursor-default',
                  )}
                >
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
            <div className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 border border-orange-200 px-2.5 py-1.5 rounded-lg font-medium">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Pending department completion</span>
              <span className="sm:hidden">Pending</span>
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

      {advanceError && (
        <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {advanceError}
        </div>
      )}

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
            {unlockError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{unlockError}</p>
            )}
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

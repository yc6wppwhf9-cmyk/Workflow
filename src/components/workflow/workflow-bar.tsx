'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Lock, ChevronRight, Unlock, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { WORKFLOW_STAGES, STAGE_LABELS, STAGE_OWNER_ROLE, type WorkflowStage, type Product, type Profile } from '@/lib/types'
import { cn } from '@/lib/utils'

interface WorkflowBarProps {
  product: Product
  profile: Profile
}

export function WorkflowBar({ product, profile }: WorkflowBarProps) {
  const router = useRouter()
  const [advancing, setAdvancing] = useState(false)
  const [unlockOpen, setUnlockOpen] = useState(false)
  const [unlockReason, setUnlockReason] = useState('')
  const [unlockLoading, setUnlockLoading] = useState(false)

  const currentIndex = WORKFLOW_STAGES.indexOf(product.workflow_stage as WorkflowStage)
  const isAdmin = profile.role === 'admin'
  const currentStageOwner = STAGE_OWNER_ROLE[product.workflow_stage as WorkflowStage]
  const canAdvance = isAdmin || profile.role === currentStageOwner
  const isLive = product.workflow_stage === 'product_live'

  async function advanceStage() {
    if (currentIndex >= WORKFLOW_STAGES.length - 1) return
    setAdvancing(true)

    const supabase = createClient()
    const nextStage = WORKFLOW_STAGES[currentIndex + 1]

    await supabase.from('products').update({
      workflow_stage: nextStage,
      updated_by: profile.id,
    }).eq('id', product.id)

    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: `advanced stage to "${STAGE_LABELS[nextStage]}"`,
      department: profile.role,
    })

    router.refresh()
    setAdvancing(false)
  }

  async function requestUnlock() {
    setUnlockLoading(true)
    const supabase = createClient()

    if (isAdmin) {
      // Admin can unlock directly
      const prevStage = WORKFLOW_STAGES[currentIndex - 1] || 'draft'
      await supabase.from('products').update({
        workflow_stage: prevStage,
        updated_by: profile.id,
      }).eq('id', product.id)

      await supabase.from('activity_logs').insert({
        product_id: product.id,
        user_id: profile.id,
        action: `unlocked stage back to "${STAGE_LABELS[prevStage as WorkflowStage]}"`,
        department: 'admin',
      })
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
        {/* Stage progress */}
        <div className="flex items-center gap-1 flex-wrap">
          {WORKFLOW_STAGES.map((stage, i) => {
            const isDone = i < currentIndex
            const isCurrent = i === currentIndex
            const isFuture = i > currentIndex

            return (
              <div key={stage} className="flex items-center gap-1">
                <div className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  isDone && 'bg-green-100 text-green-700',
                  isCurrent && 'bg-blue-600 text-white shadow-sm',
                  isFuture && 'bg-gray-100 text-gray-400',
                )}>
                  {isDone && <Check className="h-3 w-3" />}
                  {isCurrent && <div className="h-2 w-2 rounded-full bg-white" />}
                  {STAGE_LABELS[stage]}
                </div>
                {i < WORKFLOW_STAGES.length - 1 && (
                  <ChevronRight className={cn('h-3 w-3', i < currentIndex ? 'text-green-400' : 'text-gray-300')} />
                )}
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {!isLive && currentIndex > 0 && (
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
          {!isLive && canAdvance && (
            <Button size="sm" onClick={advanceStage} disabled={advancing}>
              {advancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Advance Stage
            </Button>
          )}
          {isLive && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
              <Check className="h-4 w-4" /> Product Live
            </span>
          )}
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
              Current stage: <strong>{STAGE_LABELS[product.workflow_stage as WorkflowStage]}</strong>
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

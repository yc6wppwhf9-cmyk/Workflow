'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './dialog'
import { Button } from './button'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

interface ConfirmDialogProps {
  open: boolean
  title: string
  description: string
  confirmLabel?: string
  variant?: 'success' | 'warning'
  loading?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open, title, description, confirmLabel = 'Confirm',
  variant = 'success', loading = false, onConfirm, onCancel,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className={`mx-auto mb-2 h-12 w-12 rounded-full flex items-center justify-center ${
            variant === 'success' ? 'bg-green-50' : 'bg-amber-50'
          }`}>
            {variant === 'success'
              ? <CheckCircle2 className="h-6 w-6 text-green-600" />
              : <AlertTriangle className="h-6 w-6 text-amber-500" />
            }
          </div>
          <DialogTitle className="text-center text-base">{title}</DialogTitle>
          <DialogDescription className="text-center text-sm leading-relaxed">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row justify-center gap-3 sm:justify-center">
          <Button variant="outline" onClick={onCancel} disabled={loading} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 ${variant === 'success' ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-500 hover:bg-amber-600'} text-white`}
          >
            {loading ? 'Processing…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

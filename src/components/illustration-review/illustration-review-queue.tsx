'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, XCircle, Loader2, Package, ArrowRight, Clock } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import Link from 'next/link'

interface FileItem {
  id: string
  name: string
  file_url: string
  uploaded_by: string
  uploader_name: string
  created_at: string
}

interface ProductGroup {
  product: { id: string; name: string; category: string; sub_category: string | null }
  files: FileItem[]
}

interface Props {
  groups: ProductGroup[]
  reviewerRole: string
  reviewerId: string
  reviewerName: string
}

export function IllustrationReviewQueue({ groups, reviewerRole, reviewerId, reviewerName }: Props) {
  const router  = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // Track per-file state: pending | approving | rejecting | approved | rejected
  type FileState = 'pending' | 'approving' | 'rejecting' | 'approved' | 'rejected'
  const [fileStates, setFileStates] = useState<Record<string, FileState>>({})
  const [rejectBoxId, setRejectBoxId]   = useState<string | null>(null)
  const [rejectFeedback, setRejectFeedback] = useState<Record<string, string>>({})
  const [approvingAll, setApprovingAll] = useState<Record<string, boolean>>({})
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)

  function setState(fileId: string, state: FileState) {
    setFileStates(prev => ({ ...prev, [fileId]: state }))
  }

  async function reviewFile(fileId: string, status: 'approved' | 'rejected', uploadedBy: string, productId: string, productName: string, feedback?: string) {
    setState(fileId, status === 'approved' ? 'approving' : 'rejecting')
    await supabase.from('product_files').update({
      review_status:   status,
      review_feedback: feedback || null,
      reviewed_by:     reviewerId,
      reviewed_at:     new Date().toISOString(),
    }).eq('id', fileId)

    await supabase.from('activity_logs').insert({
      product_id: productId,
      user_id:    reviewerId,
      action:     `${status} illustration (from review queue)`,
      department: 'design',
    })

    if (status === 'approved') {
      fetch('/api/notify-illustration-approved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, product_name: productName, file_id: fileId, file_name: fileId }),
      }).catch(() => {})
    }

    setState(fileId, status)
    setRejectBoxId(null)
    router.refresh()
  }

  async function approveAllForProduct(group: ProductGroup) {
    const productId = group.product.id
    setApprovingAll(prev => ({ ...prev, [productId]: true }))
    const pending = group.files.filter(f => !['approved', 'rejected'].includes(fileStates[f.id] ?? 'pending'))
    for (const file of pending) {
      setState(file.id, 'approving')
      await supabase.from('product_files').update({
        review_status: 'approved',
        review_feedback: null,
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      }).eq('id', file.id)
      setState(file.id, 'approved')
    }
    await supabase.from('activity_logs').insert({
      product_id: productId,
      user_id: reviewerId,
      action: `approved all ${pending.length} illustration(s) from review queue`,
      department: 'design',
    })
    if (pending.length > 0) {
      fetch('/api/notify-illustration-approved', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: productId, product_name: group.product.name, file_id: pending[0].id, file_name: `${pending.length} illustrations` }),
      }).catch(() => {})
    }
    setApprovingAll(prev => ({ ...prev, [productId]: false }))
    router.refresh()
  }

  if (groups.length === 0) {
    return (
      <div className="text-center py-20 border-2 border-dashed border-gray-200 rounded-xl">
        <CheckCircle2 className="h-12 w-12 text-green-400 mx-auto mb-3" />
        <p className="text-base font-semibold text-gray-700">All caught up!</p>
        <p className="text-sm text-gray-400 mt-1">No illustrations pending your review.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {groups.map(group => {
        const activeFiles = group.files.filter(f => !['approved', 'rejected'].includes(fileStates[f.id] ?? 'pending'))
        const doneCount   = group.files.length - activeFiles.length
        const allDone     = activeFiles.length === 0

        return (
          <div key={group.product.id} className={`bg-white rounded-xl border ${allDone ? 'border-green-200' : 'border-gray-200'} overflow-hidden`}>
            {/* Product header */}
            <div className={`flex items-center justify-between px-5 py-3.5 border-b ${allDone ? 'bg-green-50 border-green-100' : 'bg-gray-50 border-gray-100'}`}>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                  <Package className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{group.product.name}</p>
                  <p className="text-xs text-gray-400">
                    {group.product.sub_category ?? group.product.category}
                    {' · '}
                    {allDone
                      ? <span className="text-green-600 font-medium">All {group.files.length} reviewed</span>
                      : <span>{activeFiles.length} pending{doneCount > 0 ? `, ${doneCount} done` : ''}</span>
                    }
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!allDone && activeFiles.length >= 2 && (
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-green-600 hover:bg-green-700"
                    disabled={approvingAll[group.product.id]}
                    onClick={() => approveAllForProduct(group)}
                  >
                    {approvingAll[group.product.id]
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <CheckCircle2 className="h-3 w-3" />}
                    Approve All ({activeFiles.length})
                  </Button>
                )}
                <Link
                  href={`/products/${group.product.id}?tab=design`}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                >
                  Open <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>

            {/* Illustration grid */}
            <div className="p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {group.files.map(file => {
                const state = fileStates[file.id] ?? 'pending'
                const isDone = state === 'approved' || state === 'rejected'
                const isBusy = state === 'approving' || state === 'rejecting'

                return (
                  <div key={file.id} className={`relative rounded-xl border-2 overflow-hidden ${
                    state === 'approved' ? 'border-green-400 opacity-60' :
                    state === 'rejected' ? 'border-red-400 opacity-60'  :
                    'border-gray-200'
                  }`}>
                    {/* Thumbnail */}
                    <button
                      className="relative w-full aspect-square bg-gray-50 block group"
                      onClick={() => setLightbox({ url: file.file_url, name: file.name })}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={file.file_url} alt={file.name} className="w-full h-full object-cover group-hover:opacity-90 transition-opacity" />
                      {/* Done overlay */}
                      {isDone && (
                        <div className={`absolute inset-0 flex items-center justify-center ${state === 'approved' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                          {state === 'approved'
                            ? <CheckCircle2 className="h-8 w-8 text-green-600" />
                            : <XCircle className="h-8 w-8 text-red-600" />
                          }
                        </div>
                      )}
                      {isBusy && (
                        <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                        </div>
                      )}
                    </button>

                    {/* File name + uploader */}
                    <div className="px-2 py-1.5 bg-white">
                      <p className="text-[11px] text-gray-600 truncate">{file.name}</p>
                      <p className="text-[10px] text-gray-400 truncate">{file.uploader_name}</p>
                    </div>

                    {/* Action buttons — only when pending */}
                    {!isDone && !isBusy && (
                      <>
                        {rejectBoxId === file.id ? (
                          <div className="px-2 pb-2 space-y-1.5">
                            <textarea
                              rows={2}
                              placeholder="Reason (optional)…"
                              className="w-full text-[11px] border border-gray-200 rounded px-2 py-1 resize-none"
                              value={rejectFeedback[file.id] ?? ''}
                              onChange={e => setRejectFeedback(prev => ({ ...prev, [file.id]: e.target.value }))}
                            />
                            <div className="flex gap-1">
                              <button
                                onClick={() => reviewFile(file.id, 'rejected', file.uploaded_by, group.product.id, group.product.name, rejectFeedback[file.id])}
                                className="flex-1 bg-red-600 text-white text-[11px] py-1 rounded-md hover:bg-red-700"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setRejectBoxId(null)}
                                className="flex-1 bg-gray-100 text-gray-600 text-[11px] py-1 rounded-md hover:bg-gray-200"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex border-t border-gray-100">
                            <button
                              onClick={() => reviewFile(file.id, 'approved', file.uploaded_by, group.product.id, group.product.name)}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium text-green-700 hover:bg-green-50 transition-colors"
                            >
                              <CheckCircle2 className="h-3 w-3" /> Approve
                            </button>
                            <div className="w-px bg-gray-100" />
                            <button
                              onClick={() => setRejectBoxId(file.id)}
                              className="flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] font-medium text-red-600 hover:bg-red-50 transition-colors"
                            >
                              <XCircle className="h-3 w-3" /> Reject
                            </button>
                          </div>
                        )}
                      </>
                    )}

                    {/* Status pill for done items */}
                    {isDone && (
                      <div className={`px-2 py-1.5 text-center text-[11px] font-medium ${state === 'approved' ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>
                        {state === 'approved' ? '✓ Approved' : '✗ Rejected'}
                      </div>
                    )}

                    {/* Pending status */}
                    {!isDone && !isBusy && rejectBoxId !== file.id && (
                      <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-yellow-600 bg-yellow-50">
                        <Clock className="h-2.5 w-2.5" />
                        <span>
                          {new Date(file.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}
                        </span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
            onClick={() => setLightbox(null)}
          >
            <XCircle className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox.url}
            alt={lightbox.name}
            className="max-h-[85vh] max-w-full object-contain rounded-lg"
            onClick={e => e.stopPropagation()}
          />
          <p className="absolute bottom-6 text-white/60 text-sm">{lightbox.name}</p>
        </div>
      )}
    </div>
  )
}

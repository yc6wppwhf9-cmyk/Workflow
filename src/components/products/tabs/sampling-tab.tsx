'use client'

import { useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, Download, ExternalLink, Layers, Loader2, Printer, Send, Trash2, Upload, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { DesignData, Product, ProductFile, Profile, SamplingData } from '@/lib/types'
import Image from 'next/image'

interface SamplingTabProps {
  product: Product
  profile: Profile
  designData: DesignData | null
  data: SamplingData | null
  files: ProductFile[]
  samplingUsers: Pick<Profile, 'id' | 'full_name'>[]
}

function TechPackValue({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-gray-800 whitespace-pre-wrap">{value}</p>
    </div>
  )
}


export function SamplingTab({ product, profile, designData, data, files, samplingUsers }: SamplingTabProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const sampleInputRef = useRef<HTMLInputElement>(null)
  const [samplerName, setSamplerName] = useState(data?.sampler_name || '')
  const [remarks, setRemarks] = useState(data?.sampler_remarks || '')
  const [assignedTo, setAssignedTo] = useState(data?.assigned_to || '')
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<number | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [activeVariantIdx, setActiveVariantIdx] = useState(0)

  const variants = designData?.variants && designData.variants.length > 0
    ? designData.variants
    : designData
      ? [designData]
      : []
  const activeVariant = variants[activeVariantIdx] || null

  const isSampler = ['admin', 'sampling', 'merchandising', 'merchandising_head'].includes(profile.role)
  const isMerchHead = ['admin', 'merchandising_head'].includes(profile.role)
  const canReview = ['admin', 'management'].includes(profile.role)
  const sampleImages = files.filter(f => f.department === 'sampling' && f.file_type?.startsWith('image/'))

  // Approved design illustrations — grouped by colour_tag for the sampling team
  const approvedDesignIllos = files.filter(f =>
    f.department === 'design' &&
    f.review_status === 'approved' &&
    f.file_type?.startsWith('image/') &&
    f.colour_tag !== 'print'
  )

  // Colour SKUs: prefer top-level field, fall back to union across variants
  const allSkus: string[] = designData?.color_skus?.length
    ? designData.color_skus
    : (designData?.variants ?? []).flatMap((v: any) => v.color_skus ?? [])

  // Group illustrations by colour_tag so sampling team sees each colour separately
  const colorGroups: Record<string, typeof approvedDesignIllos> = {}
  for (const f of approvedDesignIllos) {
    const key = f.colour_tag || '__none__'
    if (!colorGroups[key]) colorGroups[key] = []
    colorGroups[key].push(f)
  }
  // Colour entries: tagged colours first (alphabetical), untagged last
  const colorGroupEntries = Object.entries(colorGroups).sort(([a], [b]) => {
    if (a === '__none__') return 1
    if (b === '__none__') return -1
    return a.localeCompare(b)
  })
  const status = data?.sample_review_status || 'not_started'
  const isApproved = status === 'approved'
  const isPending = status === 'pending_review'
  const isRejected = status === 'rejected'

  async function saveAssignment() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('sampling_data') as any).update({
      assigned_to: assignedTo || null,
      updated_by: profile.id,
    }).eq('product_id', product.id)
    toast.success('Sampling assignment saved')
    router.refresh()
  }

  async function saveRemarks() {
    setSaving(true)
    await supabase.from('sampling_data').update({
      sampler_name: samplerName || null,
      sampler_remarks: remarks || null,
      updated_by: profile.id,
    }).eq('product_id', product.id)
    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: 'updated sampling remarks',
      department: 'sampling',
    })
    setSaving(false)
    toast.success('Remarks saved')
    router.refresh()
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return
    
    if (sampleImages.length + selectedFiles.length > 10) {
      toast.error(`You cannot upload more than 10 sample images in total. Currently you have ${sampleImages.length}.`)
      if (sampleInputRef.current) sampleInputRef.current.value = ''
      return
    }

    setUploading(true)
    setUploadProgress({ done: 0, total: selectedFiles.length })
    setUploadSuccess(null)
    let done = 0
    for (const file of selectedFiles) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', `products/${product.id}/sampling`)
      const res = await fetch('/api/upload-image', { method: 'POST', body: fd })
      if (res.ok) {
        const { url } = await res.json() as { url: string }
        await supabase.from('product_files').insert({
          product_id: product.id,
          name: file.name,
          file_url: url,
          file_type: file.type,
          file_size: file.size,
          department: 'sampling',
          uploaded_by: profile.id,
        })
      }
      done++
      setUploadProgress({ done, total: selectedFiles.length })
    }
    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: `uploaded ${selectedFiles.length} sample image(s)`,
      department: 'sampling',
    })
    setUploading(false)
    setUploadProgress(null)
    setUploadSuccess(selectedFiles.length)
    setTimeout(() => setUploadSuccess(null), 3000)
    toast.success(`${selectedFiles.length} image${selectedFiles.length !== 1 ? 's' : ''} uploaded`)
    if (sampleInputRef.current) sampleInputRef.current.value = ''
    router.refresh()
  }

  async function deleteFile(file: ProductFile) {
    await fetch('/api/delete-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_url: file.file_url, file_id: file.id }),
    })
    router.refresh()
  }

  async function submitSampleForReview() {
    setSaving(true)
    await supabase.from('sampling_data').update({
      sampler_name: samplerName || null,
      sampler_remarks: remarks || null,
      sample_review_status: 'pending_review',
      designer_feedback: null,
      reviewed_by: null,
      reviewed_at: null,
      is_completed: true,
      updated_by: profile.id,
    }).eq('product_id', product.id)
    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: 'marked sample complete and sent to management for approval',
      department: 'sampling',
    })
    setSaving(false)
    toast.success('Sample sent for management approval')
    router.refresh()
  }

  async function reviewSample(nextStatus: 'approved' | 'rejected') {
    setReviewing(true)
    await fetch('/api/sampling-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id, status: nextStatus, feedback }),
    })
    setFeedback('')
    setReviewing(false)
    router.refresh()
  }

  async function markSamplingComplete() {
    setSaving(true)
    await supabase.rpc('advance_product_stage', {
      p_product_id: product.id,
      p_next_stage: 'merchandising_completed',
      p_user_id: profile.id,
      p_action: 'merchandising head marked sampling complete — stage advanced to Merchandising',
      p_department: 'merchandising_head',
    })
    fetch('/api/notify-stage-advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id, product_name: product.name, next_stage: 'merchandising_completed' }),
    }).catch(() => {})
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="space-y-4">

      {/* ── Approved illustrations — grouped by colour ───────────────────── */}
      {approvedDesignIllos.length > 0 && (
        <Card className={`border-purple-200 ${product.workflow_stage === 'design_completed' ? 'border-2' : ''}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-purple-800">
              <Layers className="h-4 w-4" />
              Approved Illustrations for Sampling ({approvedDesignIllos.length})
              {product.workflow_stage === 'design_completed' && (
                <span className="ml-auto text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                  Design still in progress — early sampling
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-xs text-gray-500">
              Approved by the Design Head. Each colour section shows which illustrations belong to that variant.
              {product.workflow_stage === 'design_completed' && ' More colours may be added as remaining illustrations get approved.'}
            </p>

            {/* Colour-SKU reference strip (if SKUs exist) */}
            {allSkus.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide self-center mr-1">Colour SKUs:</span>
                {allSkus.map(sku => (
                  <span key={sku} className="text-xs font-mono bg-violet-100 text-violet-800 px-2 py-0.5 rounded-full">{sku}</span>
                ))}
                {designData?.sample_color && (
                  <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                    Sample colour: {designData.sample_color}
                  </span>
                )}
              </div>
            )}

            {/* Colour-specific remarks hint */}
            {designData?.remarks && (
              <div className="text-xs bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-800">
                <span className="font-semibold">Designer Remarks (colour notes):</span> {designData.remarks}
              </div>
            )}

            {/* Grouped by colour */}
            {colorGroupEntries.map(([colourKey, illos]) => (
              <div key={colourKey}>
                {/* Colour header */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-px flex-1 bg-gray-200" />
                  {colourKey === '__none__' ? (
                    <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2.5 py-0.5 rounded-full whitespace-nowrap">
                      General / All colours ({illos.length})
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-violet-800 bg-violet-100 px-2.5 py-0.5 rounded-full whitespace-nowrap font-mono">
                      {colourKey} — {illos.length} illustration{illos.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <div className="h-px flex-1 bg-gray-200" />
                </div>

                {/* Illustrations for this colour */}
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {illos.map(f => (
                    <a
                      key={f.id}
                      href={f.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative aspect-square rounded-lg overflow-hidden border-2 border-green-300 bg-gray-50 hover:opacity-90 transition-opacity"
                      title={f.name}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.file_url} alt={f.name} className="w-full h-full object-cover" />
                      <div className="absolute top-1 left-1 flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-green-500 text-white text-[9px] font-medium pointer-events-none">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                      </div>
                      <div
                        className={`absolute bottom-0 left-0 right-0 text-white text-[9px] text-center py-0.5 px-1 truncate pointer-events-none ${
                          colourKey !== '__none__' ? 'bg-violet-700/80 font-semibold' : 'bg-black/60'
                        }`}
                        title={f.name}
                      >
                        {colourKey !== '__none__' ? `${colourKey} — ${f.name}` : f.name}
                      </div>
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <ExternalLink className="h-5 w-5 text-white" />
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Design Tech Pack</CardTitle>
          <div className="flex items-center gap-2">
            <a
              href={`/api/export-sampling-techpack?product_id=${product.id}`}
              download
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export Excel
            </a>
            <Button
              size="sm" variant="outline" className="gap-1.5"
              onClick={() => {
                const w = window.open(`/print/${product.id}`, '_blank')
                if (w) w.onload = () => w.print()
              }}
            >
              <Printer className="h-3.5 w-3.5" /> Print Tech Pack
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {designData && activeVariant ? (
            <div className="space-y-4">
              {variants.length > 1 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {variants.map((v: any, i: number) => (
                    <button
                      key={i}
                      onClick={() => setActiveVariantIdx(i)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        i === activeVariantIdx
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Variant {i + 1} {v.sample_color ? `(${v.sample_color})` : ''}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                <TechPackValue label="Designer" value={activeVariant.designer_name} />
                <TechPackValue label="Sample Color" value={activeVariant.sample_color} />
                <TechPackValue label="Farma" value={activeVariant.farma} />
                <TechPackValue label="Season Year" value={activeVariant.season_year} />
                <TechPackValue label="Fabric" value={activeVariant.fabric} />
                <TechPackValue label="Lining" value={activeVariant.lining} />
                <TechPackValue label="Air Mesh" value={activeVariant.air_mesh} />
                <TechPackValue label="Zipper" value={activeVariant.zipper} />
                <TechPackValue label="Puller" value={activeVariant.puller} />
                <TechPackValue label="9mm Patta" value={activeVariant.patta_9mm} />
                <TechPackValue label="Patta 1" value={activeVariant.patta_1} />
                <TechPackValue label="Patta 2" value={activeVariant.patta_2} />
                <TechPackValue label="Lader Lock" value={activeVariant.lader_lock} />
                <TechPackValue label="Branding" value={activeVariant.branding} />
                <TechPackValue label="Screen Print" value={activeVariant.screen_print} />
                <TechPackValue label="Digital Print" value={activeVariant.digital_print} />
                <TechPackValue label="Bartech" value={activeVariant.bartech} />
                <TechPackValue label="Re-sampling By" value={activeVariant.re_sampling_by} />
              </div>

              {activeVariant.color_skus && activeVariant.color_skus.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Color SKUs</p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeVariant.color_skus.map((sku: string) => (
                      <span key={sku} className="text-xs font-mono bg-violet-100 text-violet-800 px-2.5 py-0.5 rounded-full">{sku}</span>
                    ))}
                  </div>
                </div>
              )}

              {activeVariant.unique_feature && (
                <div className="border-t border-gray-100 pt-3">
                  <TechPackValue label="Unique Feature / USP" value={activeVariant.unique_feature} />
                </div>
              )}

              {activeVariant.remarks && (
                <div className="border-t border-gray-100 pt-3">
                  <TechPackValue label="Designer Remarks" value={activeVariant.remarks} />
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Design tech pack is not available yet.</p>
          )}
        </CardContent>
      </Card>

      <Card className={isRejected ? 'border-red-200' : isPending ? 'border-yellow-200' : isApproved ? 'border-green-200' : ''}>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Sample Images</CardTitle>
          {isSampler && !isApproved && (
            <>
              <Button size="sm" variant="outline" onClick={() => sampleInputRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploadProgress ? `${uploadProgress.done}/${uploadProgress.total} uploaded` : 'Upload Sample'}
              </Button>
              <input ref={sampleInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Assignment — only merchandising_head / admin can assign */}
          {isMerchHead && (
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <Label className="shrink-0 text-sm text-gray-600">Assign To</Label>
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                className="flex-1 h-8 text-sm border border-gray-200 rounded-md px-2 bg-white"
              >
                <option value="">— Unassigned —</option>
                {samplingUsers.map(u => (
                  <option key={u.id} value={u.id}>{u.full_name}</option>
                ))}
              </select>
              <Button size="sm" variant="outline" onClick={saveAssignment}>Save</Button>
            </div>
          )}
          {!isMerchHead && data?.assigned_to && (
            <div className="text-xs text-gray-500 pb-2 border-b border-gray-100">
              Assigned to: <span className="font-medium text-gray-800">{samplingUsers.find(u => u.id === data.assigned_to)?.full_name ?? data.assigned_to}</span>
            </div>
          )}

          {/* Upload progress */}
          {uploadProgress && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between text-sm text-blue-700 font-medium">
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Uploading images…</span>
                <span>{uploadProgress.done} / {uploadProgress.total}</span>
              </div>
              <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%` }} />
              </div>
            </div>
          )}
          {uploadSuccess !== null && !uploadProgress && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 flex items-center gap-2 text-sm text-green-700 font-medium">
              <CheckCircle2 className="h-4 w-4" /> {uploadSuccess} image{uploadSuccess !== 1 ? 's' : ''} uploaded successfully
            </div>
          )}

          {sampleImages.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-lg py-10 text-center">
              <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No sample images uploaded yet.</p>
              {isSampler && !isApproved && <p className="text-xs text-gray-400 mt-1">Click &quot;Upload Sample&quot; above to add images</p>}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {sampleImages.map(file => (
                <div key={file.id} className="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <Image src={file.file_url} alt={file.name} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                    <a href={file.file_url} target="_blank" rel="noopener noreferrer" className="h-8 w-8 rounded-full bg-white flex items-center justify-center">
                      <ExternalLink className="h-4 w-4 text-gray-700" />
                    </a>
                    {isSampler && !isApproved && (
                      <button className="h-8 w-8 rounded-full bg-white flex items-center justify-center" onClick={() => deleteFile(file)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Sampler Name</Label>
            <Input
              value={samplerName}
              onChange={e => setSamplerName(e.target.value)}
              disabled={!isSampler || isApproved}
              placeholder="Name of the person who made the sample"
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Sampler Remarks</Label>
            <Textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              disabled={!isSampler || isApproved}
              rows={4}
              placeholder="Construction notes, deviations, material observations, fit issues..."
            />
          </div>

          {isRejected && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1">Sample Rejected by Management</p>
              <p className="text-sm text-red-800 whitespace-pre-wrap">{data?.designer_feedback || 'No feedback provided.'}</p>
            </div>
          )}

          {isPending && (
            <div className="flex items-center gap-2 rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-700">
              <Clock className="h-4 w-4" /> Waiting for management approval.
            </div>
          )}

          {isApproved && (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4" /> Sample approved.
            </div>
          )}

          {isSampler && !isApproved && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={saveRemarks} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Remarks
              </Button>
              <Button onClick={submitSampleForReview} disabled={saving || sampleImages.length === 0 || isPending}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send for Approval
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {canReview && isPending && (
        <Card className="border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Management Sample Approval</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600">Approve the sample to allow the merchandising head to advance the stage, or reject with a remark for the sampling team.</p>
            <Textarea
              value={feedback}
              onChange={e => setFeedback(e.target.value)}
              rows={3}
              placeholder="Required when rejecting the sample..."
            />
            <div className="flex gap-2">
              <Button onClick={() => reviewSample('approved')} disabled={reviewing}>
                {reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve Sample
              </Button>
              <Button variant="outline" className="text-red-600 border-red-200" onClick={() => reviewSample('rejected')} disabled={reviewing || !feedback.trim()}>
                <XCircle className="h-4 w-4" />
                Reject with Remark
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isMerchHead && isApproved && product.workflow_stage === 'sampling_completed' && (
        <Card className="border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Mark Sampling Complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-600">Sample has been approved by the designer. Click below to advance the product to the Merchandising stage.</p>
            <Button onClick={() => setConfirmOpen(true)} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Mark Sampling Complete
            </Button>
          </CardContent>
        </Card>
      )}
      <ConfirmDialog
        open={confirmOpen}
        title="Mark Sampling Complete?"
        description="This will advance the product to the Merchandising stage and notify the merchandising head. Sampling fields will be locked."
        confirmLabel="Yes, Mark Complete"
        loading={saving}
        onConfirm={() => { setConfirmOpen(false); markSamplingComplete() }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}

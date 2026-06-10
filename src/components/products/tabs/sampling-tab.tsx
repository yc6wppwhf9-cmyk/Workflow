'use client'

import { useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, Download, ExternalLink, FileText, FlaskConical, Layers, Loader2, Printer, Send, Trash2, Upload, XCircle } from 'lucide-react'
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
  const pdfInputRef = useRef<HTMLInputElement>(null)
  const [samplerName, setSamplerName] = useState(data?.sampler_name || '')
  const [remarks, setRemarks] = useState(data?.sampler_remarks || '')
  const [assignedTo, setAssignedTo] = useState(data?.assigned_to || '')
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [uploadSuccess, setUploadSuccess] = useState<number | null>(null)
  const [pdfUploading, setPdfUploading] = useState(false)
  const [pdfProgress, setPdfProgress] = useState<{ done: number; total: number } | null>(null)
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
  const allSampleImages = files.filter(f => f.department === 'sampling' && f.file_type?.startsWith('image/'))
  const samplePdfs = files.filter(f => f.department === 'sampling' && f.file_type === 'application/pdf')

  // Variant tag helpers — images are tagged with the variant's sample_color (or "variant_N" fallback)
  function variantTag(idx: number): string {
    const v = variants[idx] as any
    return v?.sample_color ? String(v.sample_color) : `variant_${idx}`
  }
  const sampleImages = allSampleImages.filter(f => {
    if (variants.length <= 1) return true
    return f.colour_tag === variantTag(activeVariantIdx)
  })

  // Approved design illustrations — grouped by colour_tag for the sampling team
  const approvedDesignIllos = files.filter(f =>
    f.department === 'design' &&
    f.review_status === 'approved' &&
    f.file_type?.startsWith('image/') &&
    f.colour_tag !== 'print'
  )

  // Print files uploaded by the design team (read-only for sampling)
  const printFiles = files.filter(f => f.department === 'design' && f.colour_tag === 'print')
  const printImageFiles = printFiles.filter(f => f.file_type?.startsWith('image/'))
  const [printLightboxIdx, setPrintLightboxIdx] = useState<number | null>(null)

  // Colour SKUs for the active variant only
  const allSkus: string[] = (() => {
    const v = activeVariant as any
    if (v?.color_skus?.length) return v.color_skus
    if (designData?.color_skus?.length) return designData.color_skus
    return []
  })()

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
  const isSamplingRequested = status === 'sampling_requested'

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

    const tag = variants.length > 1 ? variantTag(activeVariantIdx) : undefined
    const variantImagesForThisVariant = variants.length > 1
      ? allSampleImages.filter(f => f.colour_tag === tag)
      : allSampleImages

    if (variantImagesForThisVariant.length + selectedFiles.length > 10) {
      toast.error(`Max 10 sample images per variant. Currently ${variantImagesForThisVariant.length}.`)
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
          colour_tag: tag ?? null,
          uploaded_by: profile.id,
        })
      }
      done++
      setUploadProgress({ done, total: selectedFiles.length })
    }
    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: `uploaded ${selectedFiles.length} sample image(s)${tag ? ` for ${tag}` : ''}`,
      department: 'sampling',
    })

    // Notify the designer that sample photos have been uploaded
    fetch('/api/notify-sample-uploaded', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: product.id,
        variant_color: tag,
        variant_idx: activeVariantIdx,
        sampler_name: samplerName || profile.full_name,
        image_count: selectedFiles.length,
      }),
    }).catch(() => {})

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

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files || []).filter(f => f.type === 'application/pdf')
    if (selectedFiles.length === 0) return
    setPdfUploading(true)
    setPdfProgress({ done: 0, total: selectedFiles.length })
    let done = 0
    for (const file of selectedFiles) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', `products/${product.id}/sampling`)
      const res = await fetch('/api/upload-file', { method: 'POST', body: fd })
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
      setPdfProgress({ done, total: selectedFiles.length })
    }
    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: `uploaded ${selectedFiles.length} sampling PDF(s)`,
      department: 'sampling',
    })
    setPdfUploading(false)
    setPdfProgress(null)
    toast.success(`${selectedFiles.length} PDF${selectedFiles.length !== 1 ? 's' : ''} uploaded`)
    if (pdfInputRef.current) pdfInputRef.current.value = ''
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

      {/* ── Design Reference Image / Approved illustrations ────────────── */}
      {(variants.length > 0 || approvedDesignIllos.length > 0) && (
        <Card className={`border-purple-200 ${product.workflow_stage === 'design_completed' ? 'border-2' : ''}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-purple-800">
              <Layers className="h-4 w-4" />
              Design Reference
              {product.workflow_stage === 'design_completed' && (
                <span className="ml-auto text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                  Design still in progress
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {variants.length > 1 ? (
              <>
                {/* Variant tabs */}
                <div className="flex flex-wrap gap-2">
                  {variants.map((v: any, i: number) => (
                    <button
                      key={i}
                      onClick={() => setActiveVariantIdx(i)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                        i === activeVariantIdx
                          ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                      }`}
                    >
                      Design {i + 1}
                    </button>
                  ))}
                </div>

                {/* Image for active variant */}
                {(() => {
                  const v = variants[activeVariantIdx] as any

                  // Show variant reference image if uploaded
                  if (v?.variant_image_url) {
                    return (
                      <a href={v.variant_image_url} target="_blank" rel="noopener noreferrer" className="block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={v.variant_image_url}
                          alt={`Variant ${activeVariantIdx + 1} reference`}
                          className="max-h-80 w-auto rounded-lg border border-gray-200 object-contain hover:opacity-90 transition-opacity"
                        />
                      </a>
                    )
                  }

                  // Fall back to approved illustrations
                  const colourToken = v?.sample_color
                    ? (v.sample_color.includes(' — ') ? v.sample_color.split(' — ').pop()?.trim() : v.sample_color)
                    : null
                  const variantIllos = colourToken
                    ? approvedDesignIllos.filter(f =>
                        f.colour_tag && f.colour_tag.toUpperCase() === colourToken.toUpperCase()
                      )
                    : []
                  // For multi-variant products: never show untagged illustrations as fallback
                  // — untagged images could belong to any design and would show for all, which is misleading.
                  const toShow = variantIllos

                  return toShow.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                      {toShow.map(f => (
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
                          <div className="absolute bottom-0 left-0 right-0 bg-purple-700/80 text-white text-[9px] text-center py-0.5 px-1 truncate pointer-events-none font-semibold">
                            {f.colour_tag || f.name}
                          </div>
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                            <ExternalLink className="h-5 w-5 text-white" />
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 py-4 text-center">
                      No reference image or illustrations for this variant yet.
                    </p>
                  )
                })()}
              </>
            ) : (
              /* Single variant or no variants */
              (() => {
                const v = variants[0] as any
                if (v?.variant_image_url) {
                  return (
                    <a href={v.variant_image_url} target="_blank" rel="noopener noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={v.variant_image_url}
                        alt="Variant 1 reference"
                        className="max-h-80 w-auto rounded-lg border border-gray-200 object-contain hover:opacity-90 transition-opacity"
                      />
                    </a>
                  )
                }
                if (approvedDesignIllos.length === 0) return null
                return (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {approvedDesignIllos.map(f => (
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
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center py-0.5 px-1 truncate pointer-events-none">
                          {f.name}
                        </div>
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <ExternalLink className="h-5 w-5 text-white" />
                        </div>
                      </a>
                    ))}
                  </div>
                )
              })()
            )}

            {/* Colour SKUs */}
            {allSkus.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2.5 bg-gray-50 rounded-lg border border-gray-200">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide self-center mr-1">Colour SKUs:</span>
                {allSkus.map(sku => (
                  <span key={sku} className="text-xs font-mono bg-violet-100 text-violet-800 px-2 py-0.5 rounded-full">{sku}</span>
                ))}
              </div>
            )}

          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Design Tech Pack</CardTitle>
          <div className="flex items-center gap-2">
            {designData?.techpack_pdf_url && (
              <a
                href={designData.techpack_pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 border border-red-200 bg-red-50 hover:bg-red-100 px-2.5 py-1 rounded-lg transition-colors"
              >
                <FileText className="h-3.5 w-3.5" />
                View PDF
              </a>
            )}
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
                      Design {i + 1}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                <TechPackValue label="Style Name" value={activeVariant.style_name} />
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
                <TechPackValue label="Add On 1" value={activeVariant.add_on_1} />
                <TechPackValue label="Add On 2" value={activeVariant.add_on_2} />
                <TechPackValue label="Add On 3" value={activeVariant.add_on_3} />
                <TechPackValue label="Designer Sign" value={activeVariant.designer_sign} />
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
          {/* Variant tabs — shown when multiple variants exist */}
          {variants.length > 1 && (
            <div className="flex flex-wrap gap-2 pb-2 border-b border-gray-100">
              {variants.map((v: any, i: number) => {
                const tag = variantTag(i)
                const count = allSampleImages.filter(f => f.colour_tag === tag).length
                return (
                  <button
                    key={i}
                    onClick={() => setActiveVariantIdx(i)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      i === activeVariantIdx
                        ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-violet-300 hover:bg-violet-50'
                    }`}
                  >
                    Design {i + 1}
                    {count > 0 && (
                      <span className={`ml-0.5 rounded-full px-1.5 py-0 text-[10px] font-bold ${i === activeVariantIdx ? 'bg-violet-400 text-white' : 'bg-gray-200 text-gray-600'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

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

          {isSamplingRequested && (
            <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-700">
              <FlaskConical className="h-4 w-4 shrink-0" /> Design team has sent this for sampling — upload sample photos and press &quot;Send for Approval&quot; when ready.
            </div>
          )}

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
              {!isPending && (
                <Button onClick={submitSampleForReview} disabled={saving || sampleImages.length === 0}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send for Approval
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Print Files (read-only, uploaded by design team) ──────── */}
      {printFiles.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-500" />
              Print Files
              <span className="ml-auto text-xs font-normal text-gray-400">uploaded by design team</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
              {printFiles.map(f => {
                const isPdf = f.file_type === 'application/pdf'
                return (
                  <div key={f.id} className="group relative rounded-lg overflow-hidden border border-gray-200 bg-gray-50 aspect-square">
                    {isPdf ? (
                      <button
                        onClick={() => window.open(f.file_url, '_blank')}
                        className="w-full h-full flex flex-col items-center justify-center gap-1 hover:bg-gray-100 transition-colors"
                      >
                        <FileText className="h-8 w-8 text-red-400" />
                        <p className="text-[10px] text-gray-500 px-1 truncate w-full text-center">{f.name}</p>
                      </button>
                    ) : (
                      <button
                        onClick={() => setPrintLightboxIdx(printImageFiles.findIndex(x => x.id === f.id))}
                        className="w-full h-full focus:outline-none"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.file_url} alt={f.name} className="w-full h-full object-cover" />
                      </button>
                    )}
                    {!isPdf && (
                      <div className="absolute inset-x-0 bottom-0 bg-black/40 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-[10px] text-white truncate">{f.name}</p>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
      {printLightboxIdx !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setPrintLightboxIdx(null)}
        >
          <button className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl leading-none" onClick={() => setPrintLightboxIdx(null)}>✕</button>
          {printImageFiles[printLightboxIdx] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={printImageFiles[printLightboxIdx].file_url}
              alt={printImageFiles[printLightboxIdx].name}
              className="max-h-[90vh] max-w-[90vw] object-contain rounded"
              onClick={e => e.stopPropagation()}
            />
          )}
          {printImageFiles.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
              {printLightboxIdx + 1} / {printImageFiles.length}
            </div>
          )}
        </div>
      )}

      {/* ── Sampling PDF Documents ──────────────────────────────────── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-500" />
            Sampling Documents (PDF)
          </CardTitle>
          {isSampler && !isApproved && (
            <>
              <Button size="sm" variant="outline" onClick={() => pdfInputRef.current?.click()} disabled={pdfUploading}>
                {pdfUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {pdfProgress ? `${pdfProgress.done}/${pdfProgress.total} uploaded` : 'Upload PDF'}
              </Button>
              <input ref={pdfInputRef} type="file" accept="application/pdf" multiple className="hidden" onChange={handlePdfUpload} />
            </>
          )}
        </CardHeader>
        <CardContent>
          {pdfProgress && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 mb-3 space-y-2">
              <div className="flex items-center justify-between text-sm text-blue-700 font-medium">
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Uploading PDFs…</span>
                <span>{pdfProgress.done} / {pdfProgress.total}</span>
              </div>
              <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${Math.round((pdfProgress.done / pdfProgress.total) * 100)}%` }} />
              </div>
            </div>
          )}
          {samplePdfs.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-lg py-8 text-center">
              <FileText className="h-7 w-7 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No PDFs uploaded yet.</p>
              {isSampler && !isApproved && <p className="text-xs text-gray-400 mt-1">Click &quot;Upload PDF&quot; to add documents</p>}
            </div>
          ) : (
            <div className="space-y-2">
              {samplePdfs.map(file => (
                <div key={file.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 transition-colors">
                  <FileText className="h-5 w-5 text-red-500 shrink-0" />
                  <span className="flex-1 text-sm text-gray-800 truncate">{file.name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <a
                      href={file.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded border border-blue-200 bg-white"
                    >
                      <Download className="h-3.5 w-3.5" /> Download
                    </a>
                    {isSampler && !isApproved && (
                      <button
                        onClick={() => deleteFile(file)}
                        className="h-7 w-7 flex items-center justify-center rounded border border-red-200 bg-white text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
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

'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Clock, ExternalLink, Loader2, Send, Trash2, Upload, XCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import type { DesignData, Product, ProductFile, Profile, SamplingData } from '@/lib/types'

interface SamplingTabProps {
  product: Product
  profile: Profile
  designData: DesignData | null
  data: SamplingData | null
  files: ProductFile[]
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

function getStoragePath(fileUrl: string) {
  if (!fileUrl.startsWith('http')) return fileUrl
  const marker = '/product-files/'
  const parts = fileUrl.split(marker)
  return parts.length > 1 ? decodeURIComponent(parts[1].split('?')[0]) : null
}

export function SamplingTab({ product, profile, designData, data, files }: SamplingTabProps) {
  const router = useRouter()
  const sampleInputRef = useRef<HTMLInputElement>(null)
  const [samplerName, setSamplerName] = useState(data?.sampler_name || '')
  const [remarks, setRemarks] = useState(data?.sampler_remarks || '')
  const [feedback, setFeedback] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [reviewing, setReviewing] = useState(false)

  const isSampler = ['admin', 'sampling', 'merchandising', 'merchandising_head'].includes(profile.role)
  const isMerchHead = ['admin', 'merchandising_head'].includes(profile.role)
  const canReview = ['admin', 'management'].includes(profile.role)
  const sampleImages = files.filter(f => f.department === 'sampling' && f.file_type?.startsWith('image/'))
  const status = data?.sample_review_status || 'not_started'
  const isApproved = status === 'approved'
  const isPending = status === 'pending_review'
  const isRejected = status === 'rejected'

  async function saveRemarks() {
    setSaving(true)
    const supabase = createClient()
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
    router.refresh()
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return
    setUploading(true)
    const supabase = createClient()
    const ts = Date.now()

    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]
      const storagePath = `${product.id}/sampling_${ts}_${i}_${file.name}`
      const { error } = await supabase.storage.from('product-files').upload(storagePath, file, { upsert: true })
      if (!error) {
        await supabase.from('product_files').insert({
          product_id: product.id,
          name: file.name,
          file_url: storagePath,
          file_type: file.type,
          file_size: file.size,
          department: 'sampling',
          uploaded_by: profile.id,
        })
      }
    }

    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id: profile.id,
      action: `uploaded ${selectedFiles.length} sample image(s)`,
      department: 'sampling',
    })
    setUploading(false)
    if (sampleInputRef.current) sampleInputRef.current.value = ''
    router.refresh()
  }

  async function deleteFile(file: ProductFile) {
    const supabase = createClient()
    const storagePath = getStoragePath(file.file_url)
    if (storagePath) await supabase.storage.from('product-files').remove([storagePath])
    await supabase.from('product_files').delete().eq('id', file.id)
    router.refresh()
  }

  async function submitSampleForReview() {
    setSaving(true)
    const supabase = createClient()
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
    const supabase = createClient()
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
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Design Tech Pack</CardTitle>
        </CardHeader>
        <CardContent>
          {designData ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3">
                <TechPackValue label="Designer" value={designData.designer_name} />
                <TechPackValue label="Sample Color" value={designData.sample_color} />
                <TechPackValue label="Farma" value={designData.farma} />
                <TechPackValue label="Season Year" value={designData.season_year} />
                <TechPackValue label="Fabric" value={designData.fabric} />
                <TechPackValue label="Lining" value={designData.lining} />
                <TechPackValue label="Air Mesh" value={designData.air_mesh} />
                <TechPackValue label="Zipper" value={designData.zipper} />
                <TechPackValue label="Puller" value={designData.puller} />
                <TechPackValue label="9mm Patta" value={designData.patta_9mm} />
                <TechPackValue label="Patta 1" value={designData.patta_1} />
                <TechPackValue label="Patta 2" value={designData.patta_2} />
                <TechPackValue label="Lader Lock" value={designData.lader_lock} />
                <TechPackValue label="Branding" value={designData.branding} />
                <TechPackValue label="Screen Print" value={designData.screen_print} />
                <TechPackValue label="Digital Print" value={designData.digital_print} />
                <TechPackValue label="Bartech" value={designData.bartech} />
                <TechPackValue label="Re-sampling By" value={designData.re_sampling_by} />
              </div>
              {designData.remarks && (
                <div className="border-t border-gray-100 pt-3">
                  <TechPackValue label="Designer Remarks" value={designData.remarks} />
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
                Upload Sample
              </Button>
              <input ref={sampleInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} />
            </>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {sampleImages.length === 0 ? (
            <div className="border-2 border-dashed border-gray-200 rounded-lg py-10 text-center">
              <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No sample images uploaded yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {sampleImages.map(file => (
                <div key={file.id} className="relative group rounded-lg overflow-hidden border border-gray-200 aspect-square bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={file.file_url} alt={file.name} className="h-full w-full object-cover" />
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
            <Button onClick={markSamplingComplete} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Mark Sampling Complete
            </Button>
          </CardContent>
        </Card>
      )}

    </div>
  )
}

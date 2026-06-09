'use client'

import { useState, useRef, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  Loader2, Lock, Save, Plus, X, Upload, Trash2,
  FileSpreadsheet, CheckCircle2, UserCheck, Clock, XCircle, Send, FileText, Download,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { CATEGORY_LABELS, CATEGORY_SUBCATEGORIES, BRANDS, CHANNELS, type ProductCategory, type Brand } from '@/lib/types'
import type { Product, Profile, DesignData, SamplingData, SalesData, ProductFile, DesignSubmission } from '@/lib/types'
import { parseTechPackAllVariants, type TechPackVariant } from '@/lib/parse-techpack'
import { cn } from '@/lib/utils'
import { ImageLightbox, type LightboxImage } from '@/components/ui/image-lightbox'

interface DesignTabProps {
  product: Product
  profile: Profile
  data: DesignData | null
  samplingData: SamplingData | null
  salesData: SalesData | null
  files: ProductFile[]
  submissions: DesignSubmission[]
  designers: Pick<Profile, 'id' | 'full_name'>[]
  designerWorkloads?: Record<string, number>
}

export function DesignTab({ product, profile, data, samplingData, salesData, files, submissions, designers, designerWorkloads }: DesignTabProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const isTeamMember   = profile.role === 'design'
  const isHead         = ['admin', 'design_head'].includes(profile.role)
  const isManagement   = profile.role === 'management'
  const isRoleAllowed  = isTeamMember || isHead || isManagement
  const isAssignedToMe = isTeamMember && data?.assigned_to === profile.id

  const designFiles = files.filter(f => f.department === 'design' && f.file_type?.startsWith('image/') && f.colour_tag !== 'print')
  const hasAnyApproved = designFiles.some(f => f.review_status === 'approved')
  const imageApproved  = hasAnyApproved
    && !designFiles.some(f => f.review_status === 'pending')
    && !designFiles.some(f => f.review_status === 'rejected')

  // Design head acting as creator: explicitly assigned to themselves, OR uploaded their own files without assigning
  const hasDesignerFiles  = designFiles.some(f => (f.uploader as any)?.role !== 'design_head')
  const headHasOwnFiles   = designFiles.some(f => (f.uploader as any)?.role === 'design_head')
  const isHeadCreatorMode = isHead && (
    data?.assigned_to === profile.id ||
    (!data?.assigned_to && headHasOwnFiles && !hasDesignerFiles)
  )

  // Only the assigned designer (or head/admin) can edit — prevents designers from touching each other's work
  // canEditFields unlocks once any illustration is approved (stays unlocked even if new pending files added)
  // In creator mode, design head is treated like a designer — needs approval before tech pack
  const canEditFields  = !data?.is_locked && !data?.is_completed && (
    isHead ? (!isHeadCreatorMode || hasAnyApproved) : (isAssignedToMe && hasAnyApproved)
  )
  // showActions = Approve/Reject buttons on illustrations; hidden for head in creator mode (management approves those)
  const showActions    = !data?.is_locked && (isHead ? !isHeadCreatorMode : (isAssignedToMe && hasAnyApproved))
  // canUploadIllos is open until design is marked complete — approval state does not block new uploads
  const canUploadIllos = !data?.is_locked && !data?.is_completed && (isHead || isAssignedToMe)

  const defaultForm = {
    channel:        data?.channel        || '',
    style_name:     data?.style_name     || '',
    designer_name:  data?.designer_name  || '',
    sample_color:   data?.sample_color   || '',
    color_skus:     data?.color_skus     || [] as string[],
    unique_feature: data?.unique_feature || '',
    farma:          data?.farma          || '',
    season_year:    data?.season_year    || '',
    fabric:         data?.fabric         || '',
    lining:         data?.lining         || '',
    air_mesh:       data?.air_mesh       || '',
    zipper:         data?.zipper         || '',
    puller:         data?.puller         || '',
    patta_9mm:      data?.patta_9mm      || '',
    patta_1:        data?.patta_1        || '',
    patta_2:        data?.patta_2        || '',
    lader_lock:     data?.lader_lock     || '',
    branding:       data?.branding       || '',
    screen_print:   data?.screen_print   || '',
    digital_print:  data?.digital_print  || '',
    bartech:        data?.bartech        || '',
    re_sampling_by: data?.re_sampling_by || '',
    remarks:        data?.remarks        || '',
    add_on_1:       data?.add_on_1       || '',
    add_on_2:       data?.add_on_2       || '',
    add_on_3:       data?.add_on_3       || '',
    designer_sign:  data?.designer_sign  || '',
  }
  
  // A stored variant is considered "real" only if it has at least one meaningful field.
  // Old products may have variants = [{}] or all-empty-string objects — in those cases
  // we fall back to defaultForm which reads from the legacy flat columns.
  const hasRealData = (v: any) =>
    v && typeof v === 'object' &&
    (v.fabric || v.designer_name || v.farma || v.sample_color || v.season_year ||
     v.zipper || v.lining || v.branding || (Array.isArray(v.color_skus) && v.color_skus.length > 0))

  const initialForms =
    data?.variants && data.variants.length > 0 && data.variants.some(hasRealData)
      ? data.variants
      : [defaultForm]
    
  const [forms, setForms] = useState<any[]>(initialForms)
  const hasTechPack      = !!(data?.techpack_pdf_url) || (forms.length > 0 && forms.some((f: any) => f.farma || f.fabric || f.designer_name || f.zipper))
  const hasVariantImages = forms.length > 0 && forms.every((f: any) => !!(f as any).variant_image_url)
  const [activeVariantIdx, setActiveVariantIdx] = useState(0)
  const activeVariant = forms[activeVariantIdx] || defaultForm

  function deleteVariant(idx: number) {
    if (forms.length <= 1) return
    const next = forms.filter((_: any, i: number) => i !== idx)
    setForms(next)
    setActiveVariantIdx(prev => (prev >= next.length ? next.length - 1 : prev === idx ? Math.max(0, idx - 1) : prev > idx ? prev - 1 : prev))
  }

  const [category, setCategory]   = useState<ProductCategory | ''>(product.category || '')
  const [subCategory, setSubCategory] = useState<string>(product.sub_category || '')

  function handleCategoryChange(val: ProductCategory | '') {
    setCategory(val)
    if (!val) { setSubCategory(''); return }
    const subs = CATEGORY_SUBCATEGORIES[val as ProductCategory] ?? []
    setSubCategory(subs.length === 1 ? subs[0] : '')
  }
  const [brand, setBrand]         = useState<Brand | ''>(product.brand || '')
  const [familyName, setFamilyName] = useState<string>(product.family_name || '')
  const [newSku, setNewSku]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saved, setSaved]         = useState(false)
  const [assignedTo, setAssignedTo] = useState<string>(data?.assigned_to || '__none__')
  const [showReassign, setShowReassign] = useState(false)  // collapsed by default when already assigned
  const [savingAssign, setSavingAssign] = useState(false)
  const [headNotes, setHeadNotes] = useState(data?.head_notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)

  
  const allColorSkus = Array.from(new Set(forms.flatMap(f => f.color_skus || [])))
  const allSampleColors = Array.from(new Set(forms.map(f => f.sample_color).filter(Boolean)))

  // Extract "NBL" from "Design 1 — NBL" for matching colour_tag values
  const variantColorToken = (sc: string) => {
    const s = (sc || '').trim()
    return s.includes(' — ') ? (s.split(' — ').pop()?.trim() ?? s) : s
  }

  const samplingStatus = samplingData?.sample_review_status ?? 'not_started'
  const samplingApproved  = samplingStatus === 'approved'
  const samplingSent      = ['sampling_requested', 'pending_review'].includes(samplingStatus)
  const samplingRejected  = samplingStatus === 'rejected'

  const [sendingSampling, setSendingSampling] = useState(false)
  const sendingSamplingRef = useRef(false)

  async function sendForSampling() {
    if (sendingSamplingRef.current) return
    sendingSamplingRef.current = true
    setSendingSampling(true)
    try {
      const approvedCount = designFiles.filter(f => f.review_status === 'approved').length
      await (supabase.from('sampling_data') as any).upsert(
        { product_id: product.id, sample_review_status: 'sampling_requested', updated_by: profile.id },
        { onConflict: 'product_id' }
      )
      await supabase.from('activity_logs').insert({
        product_id: product.id, user_id: profile.id,
        action: `sent ${approvedCount} approved illustration(s) to sampling team`,
        department: 'design',
      })
      fetch('/api/notify-send-for-sampling', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id:     product.id,
          product_name:   product.name,
          approved_count: approvedCount,
          sender_name:    profile.full_name,
        }),
      }).catch(() => {})
      toast.success(`${approvedCount} illustration(s) sent to sampling team.`)
      router.refresh()
    } finally {
      sendingSamplingRef.current = false
      setSendingSampling(false)
    }
  }

  // Batch hold status — populated when this product is complete but waiting for siblings
  const [batchPending, setBatchPending] = useState<{ id: string; name: string }[]>([])

  useEffect(() => {
    if (!data?.is_completed || !data?.assigned_to) { setBatchPending([]); return }
    if (!['design_completed', 'draft'].includes(product.workflow_stage)) { setBatchPending([]); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from('products')
      .select('id, name, design_data(is_completed, assigned_to)')
      .neq('id', product.id)
    if (product.family_name) {
      q = q.eq('family_name', product.family_name)
    } else {
      q = q.eq('category', product.category).eq('workflow_stage', product.workflow_stage)
    }
    q.then(({ data: siblings }: { data: Array<{ id: string; name: string; design_data: unknown }> | null }) => {
      type SDD = { assigned_to: string | null; is_completed: boolean }
      const pending = (siblings || []).filter(s => {
        const dd = (Array.isArray(s.design_data) ? s.design_data[0] : s.design_data) as SDD | null
        return dd?.assigned_to === data.assigned_to && !dd?.is_completed
      })
      setBatchPending(pending.map(s => ({ id: s.id, name: s.name })))
    })
  }, [data?.is_completed, data?.assigned_to, product.family_name, product.category, product.workflow_stage, product.id, supabase])

  // Submission state
  // Colour tag applied to the next batch of illustration uploads
  const [illoColorTag, setIlloColorTag] = useState<string>('')
  // Active variant tab in the illustration section (separate from tech pack form tab)
  const [activeIlloVariantIdx, setActiveIlloVariantIdx] = useState(0)

  const [submitting, setSubmitting]   = useState(false)
  const [submitDone, setSubmitDone]   = useState(false)
  const [approvingAll, setApprovingAll] = useState(false)

  // Per-image review state (for head)
  const [reviewingFileId, setReviewingFileId]           = useState<string | null>(null)
  const [fileRejectFeedback, setFileRejectFeedback]     = useState<Record<string, string>>({})
  const [showFileRejectBox, setShowFileRejectBox]       = useState<string | null>(null)

  // Per-image colour tagging state
  const [taggingFileId, setTaggingFileId] = useState<string | null>(null)

  // Illustration variant filtering
  const activeIlloToken = forms.length > 1
    ? variantColorToken((forms[activeIlloVariantIdx] as any)?.sample_color || '')
    : ''
  // Always show all illustrations — variant tabs control only the upload auto-tag, not display.
  // Hiding untagged illustrations would make existing approved images disappear unexpectedly.
  const visibleDesignFiles = designFiles
  // The colour tag that will be applied to the next upload batch
  const effectiveIlloTag = forms.length > 1 ? activeIlloToken : illoColorTag

  // Lightbox
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const lightboxImages: LightboxImage[] = visibleDesignFiles.map(f => ({
    url: f.file_url, name: f.name,
    badge: f.review_status ? (
      <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${
        f.review_status === 'approved' ? 'bg-green-500 text-white' :
        f.review_status === 'rejected' ? 'bg-red-500 text-white' :
        'bg-yellow-500 text-white'
      }`}>
        {f.review_status === 'approved' ? '✓ Approved' : f.review_status === 'rejected' ? '✗ Rejected' : '⏳ Awaiting review'}
      </span>
    ) : undefined,
  }))

  // Print files — stored as department='design', colour_tag='print' to stay within the user_role enum constraint
  const printFiles = files.filter(f => f.department === 'design' && f.colour_tag === 'print')
  const printFileRef = useRef<HTMLInputElement>(null)
  const [printUploading, setPrintUploading]     = useState(false)
  const [printProgress, setPrintProgress]       = useState<{ done: number; total: number } | null>(null)
  const [variantImgUploading, setVariantImgUploading] = useState<number | null>(null)
  const [printLightboxIdx, setPrintLightboxIdx] = useState<number | null>(null)
  const printImageFiles = printFiles.filter(f => f.file_type?.startsWith('image/'))
  const printLightboxImages: LightboxImage[] = printImageFiles.map(f => ({ url: f.file_url, name: f.name }))

  async function handlePrintUpload(selectedFiles: File[]) {
    const valid = selectedFiles.filter(f =>
      f.type.startsWith('image/') || f.type === 'application/pdf'
    )
    if (valid.length === 0) return
    setPrintUploading(true)
    setPrintProgress({ done: 0, total: valid.length })
    let done = 0
    for (const file of valid) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', `products/${product.id}/design-print`)
      const res = await fetch('/api/upload-file', { method: 'POST', body: fd })
      if (res.ok) {
        const { url } = await res.json() as { url: string }
        await supabase.from('product_files').insert({
          product_id:  product.id,
          name:        file.name,
          file_url:    url,
          file_type:   file.type,
          file_size:   file.size,
          department:  'design',
          colour_tag:  'print',
          uploaded_by: profile.id,
        })
      }
      done++
      setPrintProgress({ done, total: valid.length })
    }
    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: `uploaded ${valid.length} print file(s)`, department: 'design',
    })
    setPrintUploading(false)
    setPrintProgress(null)
    toast.success(`${valid.length} print file${valid.length !== 1 ? 's' : ''} uploaded`)
    if (printFileRef.current) printFileRef.current.value = ''
    router.refresh()
  }

  const illustrationRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading]           = useState(false)
  const [uploadingName, setUploadingName]   = useState('')
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [uploadSuccess, setUploadSuccess]   = useState<number | null>(null)

  const techPackRef = useRef<HTMLInputElement>(null)
  const saveTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (saveTimerRef.current)   clearTimeout(saveTimerRef.current)
    if (notesTimerRef.current)  clearTimeout(notesTimerRef.current)
    if (submitTimerRef.current) clearTimeout(submitTimerRef.current)
  }, [])
  const [parsingTechPack, setParsing]   = useState(false)
  const [techPackResult, setTechPackResult] = useState<{ filled: string[]; isPdf?: boolean } | null>(null)
  const [techPackVariants, setTechPackVariants] = useState<TechPackVariant[]>([])
  const [techpackPdfUrl, setTechpackPdfUrl] = useState<string | null>(data?.techpack_pdf_url ?? null)
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0)

  function F({ label, field, placeholder, mono, formIdx }: { label: string; field: string; placeholder?: string; mono?: boolean; formIdx: number }) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-gray-500">{label}</Label>
        <Input
          placeholder={placeholder || ''}
          value={(forms[formIdx][field] as string) || ''}
          onChange={e => setForms(prev => {
            const copy = [...prev]
            copy[formIdx] = { ...copy[formIdx], [field]: e.target.value }
            return copy
          })}
          disabled={!canEditFields}
          className={`h-8 text-sm ${mono ? 'font-mono' : ''}`}
        />
      </div>
    )
  }

  async function handleSave() {
    setSaving(true)
    await Promise.all([
      supabase.from('design_data').update({ variants: forms, updated_by: profile.id } as any).eq('product_id', product.id),
      (supabase.from('products').update({
        ...(category && { category }),
        sub_category: subCategory || null,
        ...(brand && { brand }),
        family_name: familyName.trim() || null,
        updated_by: profile.id,
      } as any).eq('id', product.id) as any),
    ])
    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: 'updated design data', department: 'design',
    })
    setSaving(false)
    setSaved(true)
    toast.success('Design data saved')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => { setSaved(false); router.refresh() }, 2000)
  }

  async function markComplete() {
    const becomingComplete = !data?.is_completed
    setSaving(true)

    await supabase.from('design_data').update({
      variants: forms, is_completed: becomingComplete, updated_by: profile.id } as any
    ).eq('product_id', product.id)
    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: becomingComplete ? 'marked design as complete' : 'marked design as incomplete',
      department: profile.role,
    })

    if (!becomingComplete || !['design_completed', 'draft'].includes(product.workflow_stage)) {
      setSaving(false)
      router.refresh()
      return
    }

    // ── Batch gate ─────────────────────────────────────────────────────────────
    // Products in the same family (or same category + designer) form a batch.
    // All of them must be design-complete before any advances to Sampling.
    const assignedTo = data?.assigned_to
    if (assignedTo) {
      type SDD = { assigned_to: string | null; is_completed: boolean }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let sibQ: any = supabase
        .from('products')
        .select('id, name, design_data(is_completed, assigned_to)')
        .neq('id', product.id)
      if (product.family_name) {
        sibQ = sibQ.eq('family_name', product.family_name)
      } else {
        sibQ = sibQ.eq('category', product.category).eq('workflow_stage', product.workflow_stage)
      }
      const { data: siblings } = await sibQ as { data: Array<{ id: string; name: string; design_data: unknown }> | null }

      const batchSiblings = (siblings || []).filter(s => {
        const dd = (Array.isArray(s.design_data) ? s.design_data[0] : s.design_data) as SDD | null
        return dd?.assigned_to === assignedTo
      })
      const incompleteInBatch = batchSiblings.filter(s => {
        const dd = (Array.isArray(s.design_data) ? s.design_data[0] : s.design_data) as SDD | null
        return !dd?.is_completed
      })

      if (incompleteInBatch.length > 0) {
        const names = incompleteInBatch.map(s => s.name).slice(0, 3).join(', ')
        const extra  = incompleteInBatch.length > 3 ? ` +${incompleteInBatch.length - 3} more` : ''
        toast.info(
          `Batch held — ${incompleteInBatch.length} other product(s) still in progress: ${names}${extra}. Stage advances once the full batch is complete.`,
          { duration: 7000 },
        )
        setSaving(false)
        router.refresh()
        return
      }

      // All complete — advance this product then cascade-advance held siblings
      await supabase.rpc('advance_product_stage', {
        p_product_id: product.id,
        p_next_stage: 'merchandising_completed',
        p_user_id:    profile.id,
        p_action:     'marked design complete — stage advanced to Sampling',
        p_department: profile.role,
      })

      const heldSiblings = batchSiblings.filter(s => {
        const dd = (Array.isArray(s.design_data) ? s.design_data[0] : s.design_data) as SDD | null
        return dd?.is_completed   // already marked complete but was held back
      })
      for (const sibling of heldSiblings) {
        await supabase.rpc('advance_product_stage', {
          p_product_id: sibling.id,
          p_next_stage: 'merchandising_completed',
          p_user_id:    profile.id,
          p_action:     'batch complete — advancing to Sampling',
          p_department: profile.role,
        })
      }

      if (heldSiblings.length > 0) {
        toast.success(`Batch complete! All ${heldSiblings.length + 1} products advanced to Sampling.`)
      }
    } else {
      // No assigned designer — no batch, advance immediately
      await supabase.rpc('advance_product_stage', {
        p_product_id: product.id,
        p_next_stage: 'merchandising_completed',
        p_user_id:    profile.id,
        p_action:     'marked design complete — stage advanced to Sampling',
        p_department: profile.role,
      })
    }

    fetch('/api/notify-stage-advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id, product_name: product.name, next_stage: 'merchandising_completed' }),
    }).catch(() => {})

    setSaving(false)
    router.refresh()
  }

  async function saveAssignment(userId: string) {
    setSavingAssign(true)
    const resolvedId = userId === '__none__' ? null : userId
    const { error } = await supabase.from('design_data').update({ assigned_to: resolvedId, updated_by: profile.id }).eq('product_id', product.id)
    if (error) {
      console.error('saveAssignment error:', error)
      setSavingAssign(false)
      return
    }
    const isSelfAssign     = resolvedId === profile.id
    const assignedDesigner = isSelfAssign ? null : designers.find(d => d.id === userId)
    const assigneeName     = isSelfAssign ? `${profile.full_name} (self)` : assignedDesigner?.full_name || 'unassigned'
    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: `assigned design to ${assigneeName}`,
      department: 'design',
    })
    const previousId   = data?.assigned_to ?? null
    const previousName = previousId === profile.id ? `${profile.full_name} (self)` : previousId ? designers.find(d => d.id === previousId)?.full_name : null

    if (resolvedId && assignedDesigner && !isSelfAssign) {
      fetch('/api/notify-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id:             product.id,
          product_name:           product.name,
          assigned_to_id:         resolvedId,
          assigned_to_name:       assignedDesigner.full_name,
          assigned_to_email:      (assignedDesigner as { full_name: string; email?: string }).email ?? '',
          department:             'design',
          assigned_by_name:       profile.full_name,
          previous_assignee_id:   previousId,
          previous_assignee_name: previousName,
        }),
      }).catch(() => {})
    } else if (!resolvedId && previousId) {
      // Unassigning without a replacement — still notify old assignee
      fetch('/api/notify-assignment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id:             product.id,
          product_name:           product.name,
          assigned_to_id:         null,
          department:             'design',
          assigned_by_name:       profile.full_name,
          previous_assignee_id:   previousId,
          previous_assignee_name: previousName,
        }),
      }).catch(() => {})
    }
    setSavingAssign(false)
    router.refresh()
  }

  async function saveHeadNotes() {
    setSavingNotes(true)
    await supabase.from('design_data').update({ head_notes: headNotes || null, updated_by: profile.id }).eq('product_id', product.id)
    setSavingNotes(false)
    setNotesSaved(true)
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(() => setNotesSaved(false), 2000)
  }

  async function submitForReview() {
    setSubmitting(true)
    const res = await fetch('/api/design-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id }),
    })
    if (res.ok) {
      setSubmitDone(true)
      if (submitTimerRef.current) clearTimeout(submitTimerRef.current)
      submitTimerRef.current = setTimeout(() => setSubmitDone(false), 3000)
    }
    setSubmitting(false)
    router.refresh()
  }

  async function reviewImage(fileId: string, status: 'approved' | 'rejected', feedback?: string) {
    setReviewingFileId(fileId)
    const file = designFiles.find(f => f.id === fileId)
    await supabase.from('product_files').update({
      review_status: status,
      review_feedback: feedback || null,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', fileId)
    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id:    profile.id,
      action:     `${status} illustration: ${file?.name || fileId}${feedback ? ` — ${feedback}` : ''}`,
      department: 'design',
    })
    if (status === 'approved') {
      fetch('/api/notify-illustration-approved', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, file_id: fileId, file_name: file?.name || fileId, feedback }),
      }).catch(() => {})
    }

    if (status === 'rejected') {
      fetch('/api/notify-illustration-rejected', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, file_id: fileId, file_name: file?.name || fileId, feedback }),
      }).catch(() => {})
    }

    // Update design_submissions status based on new state of all designer files
    const isHeadFile = (f: typeof designFiles[0]) =>
      (f.uploader as unknown as { role?: string } | null)?.role === 'design_head'
    const designerFiles = designFiles.filter(f => !isHeadFile(f))
    const updatedFiles  = designerFiles.map(f => f.id === fileId ? { ...f, review_status: status } : f)
    const allApproved   = updatedFiles.length > 0 && updatedFiles.every(f => f.review_status === 'approved')
    const anyRejected   = updatedFiles.some(f => f.review_status === 'rejected')
    if (allApproved || anyRejected) {
      await supabase.from('design_submissions')
        .update({ status: allApproved ? 'approved' : 'rejected', reviewed_at: new Date().toISOString() })
        .eq('product_id', product.id)
        .eq('status', 'pending')
    }

    setReviewingFileId(null)
    setShowFileRejectBox(null)
    setFileRejectFeedback(prev => { const next = { ...prev }; delete next[fileId]; return next })
    router.refresh()
  }

  async function approveAll(pendingFiles: typeof designFiles) {
    setApprovingAll(true)
    for (const file of pendingFiles) {
      await supabase.from('product_files').update({
        review_status: 'approved',
        review_feedback: null,
        reviewed_by: profile.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', file.id)
    }
    await supabase.from('activity_logs').insert({
      product_id: product.id,
      user_id:    profile.id,
      action:     `approved all ${pendingFiles.length} pending illustration(s)`,
      department: 'design',
    })
    fetch('/api/notify-illustration-approved', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id, file_id: pendingFiles[0].id, file_name: `${pendingFiles.length} illustrations` }),
    }).catch(() => {})

    // All pending files just approved — mark submission as approved if no rejections remain
    const isHeadFile = (f: typeof designFiles[0]) =>
      (f.uploader as unknown as { role?: string } | null)?.role === 'design_head'
    const designerFiles = designFiles.filter(f => !isHeadFile(f))
    const pendingIds    = new Set(pendingFiles.map(f => f.id))
    const stillRejected = designerFiles.some(f => !pendingIds.has(f.id) && f.review_status === 'rejected')
    if (!stillRejected) {
      await supabase.from('design_submissions')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('product_id', product.id)
        .eq('status', 'pending')
    }

    setApprovingAll(false)
    router.refresh()
  }

  
  function variantToFormUpdates(f: TechPackVariant) {
    const updates: Partial<Record<keyof typeof defaultForm, string>> = {}
    const filled: string[] = []
    const map: Array<[keyof typeof defaultForm, string, string]> = [
      ['style_name',     f.styleName,     'Style Name'],
      ['designer_name',  f.designerName,  'Designer Name'],
      ['farma',          f.farma,         'Farma'],
      ['season_year',    f.seasonYear,    'Season Year'],
      ['fabric',         f.fabric,        'Fabric'],
      ['lining',         f.lining,        'Lining'],
      ['air_mesh',       f.airMesh,       'Air Mesh'],
      ['zipper',         f.zipper,        'Zipper'],
      ['puller',         f.puller,        'Puller'],
      ['patta_9mm',      f.patta9mm,      '9mm Patta'],
      ['patta_1',        f.patta1,        'Patta 1'],
      ['patta_2',        f.patta2,        'Patta 2'],
      ['lader_lock',     f.laderLock,     'Lader Lock'],
      ['branding',       f.branding,      'Branding'],
      ['screen_print',   f.screenPrint,   'Screen Print'],
      ['digital_print',  f.digitalPrint,  'Digital Print'],
      ['bartech',        f.bartech,       'Bartech'],
      ['re_sampling_by', f.reSamplingBy,  'Re-sampling By'],
      ['remarks',        f.remarks,       'Remarks'],
      ['add_on_1',       f.addOn1,        'Add On 1'],
      ['add_on_2',       f.addOn2,        'Add On 2'],
      ['add_on_3',       f.addOn3,        'Add On 3'],
      ['designer_sign',  f.designerSign,  'Designer Sign'],
    ]
    for (const [key, val, label] of map) {
      if (val) { (updates as Record<string, string>)[key] = val; filled.push(label) }
    }
    return { updates, filled }
  }
  async function handleTechPackUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')

    setParsing(true)
    setTechPackResult(null)
    setTechPackVariants([])

    if (isPdf) {
      // ── PDF branch: upload to storage, save URL, notify ─────────────
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('folder', 'techpacks')
        const res = await fetch('/api/upload-file', { method: 'POST', body: fd })
        if (!res.ok) throw new Error('Upload failed')
        const { url } = await res.json()
        const { error: pdfSaveErr } = await (supabase.from('design_data') as any).upsert(
          { product_id: product.id, techpack_pdf_url: url, updated_by: profile.id },
          { onConflict: 'product_id' }
        )
        if (pdfSaveErr) throw new Error(pdfSaveErr.message)
        setTechpackPdfUrl(url)
        const notifyFd = new FormData()
        notifyFd.append('file', file)
        notifyFd.append('product_id', product.id)
        notifyFd.append('product_name', product.name)
        fetch('/api/notify-techpack-uploaded', { method: 'POST', body: notifyFd }).catch(() => {})
        setTechPackResult({ filled: ['PDF uploaded successfully.'], isPdf: true })
        toast.success('Tech pack PDF uploaded')
        router.refresh()
      } catch {
        toast.error('Failed to upload PDF')
        setTechPackResult({ filled: [] })
      }
      setParsing(false)
      if (techPackRef.current) techPackRef.current.value = ''
      return
    }

    // ── Excel branch: parse fields + extract embedded images ─────────
    try {
      const { read, utils } = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]
      const variants = parseTechPackAllVariants(rows)

      const fd = new FormData()
      fd.append('file', file)
      fd.append('product_id', product.id)
      fd.append('product_name', product.name)
      fetch('/api/notify-techpack-uploaded', { method: 'POST', body: fd }).catch(() => {})

      // ── Extract embedded images from the xlsx zip ─────────────────
      const variantImageUrls: (string | null)[] = []
      try {
        const JSZip = (await import('jszip')).default
        const zip = await JSZip.loadAsync(buffer)

        // Build rId → image file path from drawing relationships
        const rIdToFile: Record<string, string> = {}
        const relsFile = zip.file('xl/drawings/_rels/drawing1.xml.rels')
        if (relsFile) {
          const relsXml = await relsFile.async('text')
          for (const [, rId, target] of [...relsXml.matchAll(/Id="(rId\d+)"[^>]+Target="([^"]+)"/g)]) {
            rIdToFile[rId] = 'xl/' + target.replace('../', '')
          }
        }

        // Parse drawing XML to get anchor row+col for each image
        const anchored: Array<{ row: number; col: number; filePath: string }> = []
        const drawingFile = zip.file('xl/drawings/drawing1.xml')
        if (drawingFile && Object.keys(rIdToFile).length > 0) {
          const xml = await drawingFile.async('text')
          const blockRe = /<xdr:(?:twoCellAnchor|oneCellAnchor)[^>]*>([\s\S]*?)<\/xdr:(?:twoCellAnchor|oneCellAnchor)>/g
          for (const [, block] of [...xml.matchAll(blockRe)]) {
            const rowM = block.match(/<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/)
            const colM = block.match(/<xdr:from>[\s\S]*?<xdr:col>(\d+)<\/xdr:col>/)
            const ridM = block.match(/r:embed="(rId\d+)"/)
            if (rowM && ridM && rIdToFile[ridM[1]]) {
              anchored.push({ row: parseInt(rowM[1]), col: colM ? parseInt(colM[1]) : 0, filePath: rIdToFile[ridM[1]] })
            }
          }
        } else {
          // No drawing XML — fall back to alphabetical media file order
          Object.keys(zip.files)
            .filter(p => p.startsWith('xl/media/'))
            .sort()
            .forEach((p, i) => anchored.push({ row: i, col: i, filePath: p }))
        }

        // Detect band start rows and column bases from the spreadsheet data
        // (same structure as parseTechPackAllVariants: bands of 4 designs stacked vertically)
        const normCell = (s: string) => String(s).toUpperCase().replace(/[-:.\s"'""'']/g, '')
        const bandInfo: Array<{ startRow: number; endRow: number; bases: number[] }> = []
        for (let r = 0; r < rows.length; r++) {
          const basesInRow: number[] = []
          for (let c = 0; c < rows[r].length; c++) {
            if (normCell(rows[r][c]).startsWith('DESIGNNO')) basesInRow.push(c)
          }
          if (basesInRow.length > 0) {
            if (bandInfo.length > 0) bandInfo[bandInfo.length - 1].endRow = r
            bandInfo.push({ startRow: r, endRow: rows.length, bases: basesInRow })
          }
        }

        // For each image, determine which (band, block) it belongs to using row+col.
        // Multiple images in the same block: keep the one with the smallest col offset
        // (leftmost = primary illustration).
        const variantImageAnchors = new Map<number, { row: number; col: number; filePath: string }>()
        if (bandInfo.length > 0) {
          for (const anchor of anchored) {
            let bandIdx = -1
            for (let b = 0; b < bandInfo.length; b++) {
              if (anchor.row >= bandInfo[b].startRow && anchor.row < bandInfo[b].endRow) { bandIdx = b; break }
            }
            if (bandIdx === -1) continue
            const bases = bandInfo[bandIdx].bases
            let blockIdx = -1
            for (let b = bases.length - 1; b >= 0; b--) {
              if (anchor.col >= bases[b]) { blockIdx = b; break }
            }
            if (blockIdx === -1) continue
            const globalIdx = bandIdx * bases.length + blockIdx
            const existing = variantImageAnchors.get(globalIdx)
            if (!existing || anchor.col < existing.col) variantImageAnchors.set(globalIdx, anchor)
          }
        } else {
          // Fallback for single-band files: assign by position
          anchored.sort((a, b) => a.row - b.row || a.col - b.col)
          anchored.forEach((a, i) => { if (!variantImageAnchors.has(i)) variantImageAnchors.set(i, a) })
        }

        // Upload one image per variant
        for (let i = 0; i < variants.length; i++) {
          const anchor = variantImageAnchors.get(i) ?? null
          if (!anchor) { variantImageUrls.push(null); continue }
          const imgZipFile = zip.file(anchor.filePath)
          if (!imgZipFile) { variantImageUrls.push(null); continue }
          const blob = await imgZipFile.async('blob')
          const ext = anchor.filePath.split('.').pop()?.toLowerCase() || 'png'
          const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
          const imgFile = new File([blob], `variant_${i + 1}.${ext}`, { type: mime })
          const imgFd = new FormData()
          imgFd.append('file', imgFile)
          imgFd.append('folder', `products/${product.id}/variant-refs`)
          const res = await fetch('/api/upload-file', { method: 'POST', body: imgFd })
          variantImageUrls.push(res.ok ? (await res.json()).url : null)
        }
      } catch {
        // Image extraction is optional — never block the form fill
      }

      if (variants.length > 0) {
        const newVariantForms = variants.map((v, i) => {
          const { updates } = variantToFormUpdates(v)
          const newColorSkus = v.colorSkusStr
            ? v.colorSkusStr.split(/[\n,/]/).map(s => s.trim()).filter(Boolean)
            : []
          return {
            ...defaultForm, ...updates,
            sample_color: v.colourName || '',
            color_skus: newColorSkus,
            ...(variantImageUrls[i] ? { variant_image_url: variantImageUrls[i] } : {}),
          }
        })
        const existingReal = forms.filter(f => f.sample_color || f.farma || f.season_year || (f.color_skus && f.color_skus.length > 0))
        // Merge: new variants from upload take priority; existing variants not in the new upload are kept
        const newColors = new Set(newVariantForms.map((f: any) => (f.sample_color || '').toLowerCase().trim()).filter(Boolean))
        const keptExisting = existingReal.filter((f: any) => {
          const c = (f.sample_color || '').toLowerCase().trim()
          return !c || !newColors.has(c)
        })
        const mergedForms = [...keptExisting, ...newVariantForms]
        setForms(mergedForms)
        const [{ error: saveErr }] = await Promise.all([
          (supabase.from('design_data') as any).upsert(
            { product_id: product.id, variants: mergedForms, updated_by: profile.id },
            { onConflict: 'product_id' }
          ),
          variants[0].styleName
            ? supabase.from('products').update({ name: variants[0].styleName, updated_by: profile.id }).eq('id', product.id)
            : Promise.resolve(),
        ])
        if (saveErr) {
          toast.error(`Tech pack parsed but failed to save: ${saveErr.message}`)
          setTechPackResult({ filled: [] })
        } else {
          const imgCount = variantImageUrls.filter(Boolean).length
          const base = keptExisting.length > 0
            ? `Updated ${newVariantForms.length} variant(s). Total: ${mergedForms.length} variants.`
            : `Loaded ${mergedForms.length} variant(s).`
          setTechPackResult({ filled: [base + (imgCount > 0 ? ` ${imgCount} variant image(s) extracted.` : '')] })
          toast.success('Tech pack saved')
          router.refresh()
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      toast.error(`Tech pack upload failed: ${msg}`)
      setTechPackResult({ filled: [] })
    }
    setParsing(false)
    if (techPackRef.current) techPackRef.current.value = ''
  }

  async function handleIllustrationUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return
    
    if (designFiles.length + selectedFiles.length > 15) {
      toast.error(`You cannot upload more than 15 illustrations in total. Currently you have ${designFiles.length}.`)
      if (illustrationRef.current) illustrationRef.current.value = ''
      return
    }

    setUploading(true)
    setUploadSuccess(null)
    setUploadProgress({ done: 0, total: selectedFiles.length })
    let done = 0
    let savedCount = 0
    for (const file of selectedFiles) {
      setUploadingName(file.name)
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', `products/${product.id}/design`)
      const res = await fetch('/api/upload-image', { method: 'POST', body: fd })
      if (res.ok) {
        const { url } = await res.json() as { url: string }

        let finalTag = effectiveIlloTag.trim() || null
        if (!finalTag) {
          const nameUpper = file.name.toUpperCase()
          const matchedSku = allColorSkus.find(sku => sku && nameUpper.includes(sku.toUpperCase()))
          if (matchedSku) {
            finalTag = matchedSku
          } else {
            const matchedColor = allSampleColors.find(sc => sc && nameUpper.includes(sc.toUpperCase()))
            if (matchedColor) {
              finalTag = matchedColor
            }
          }
        }

        const { error: insertError } = await supabase.from('product_files').insert({
          product_id: product.id, name: file.name, file_url: url,
          file_type: file.type, file_size: file.size,
          department: 'design', uploaded_by: profile.id,
          review_status: 'pending',
          colour_tag: finalTag,
        })
        if (insertError) {
          toast.error(`Failed to save "${file.name}": ${insertError.message}`)
        } else {
          savedCount++
        }
      } else {
        const body = await res.json().catch(() => ({})) as { error?: string }
        toast.error(`Upload failed for "${file.name}": ${body.error || res.statusText}`)
      }
      done++
      setUploadProgress({ done, total: selectedFiles.length })
    }
    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: `uploaded ${selectedFiles.length} illustration(s)`, department: 'design',
    })
    if (isHead) {
      // Design head uploaded → notify management for approval
      fetch('/api/notify-management-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id:    product.id,
          product_name:  product.name,
          uploader_name: profile.full_name,
          file_count:    selectedFiles.length,
        }),
      }).catch(() => {})
    } else {
      // Designer uploaded → notify design head for review
      fetch('/api/notify-illustration-uploaded', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id:    product.id,
          product_name:  product.name,
          uploader_name: profile.full_name,
          file_count:    selectedFiles.length,
        }),
      }).catch(() => {})
    }
    setUploading(false)
    setUploadingName('')
    setUploadProgress(null)
    if (savedCount > 0) {
      setUploadSuccess(savedCount)
      setTimeout(() => setUploadSuccess(null), 3000)
      toast.success(`${savedCount} illustration${savedCount !== 1 ? 's' : ''} uploaded`)
      router.refresh()
    }
    if (illustrationRef.current) illustrationRef.current.value = ''
  }

  async function deleteFile(file: ProductFile) {
    if (file.review_status === 'approved') {
      toast.error('Approved illustrations cannot be deleted.')
      return
    }
    await fetch('/api/delete-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_url: file.file_url, file_id: file.id }),
    })
    router.refresh()
  }

  async function tagIllustration(fileId: string, colourTag: string | null) {
    setTaggingFileId(fileId)
    await fetch('/api/tag-illustration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: fileId, colour_tag: colourTag }),
    })
    setTaggingFileId(null)
    router.refresh()
  }

  // Viewer mode: any role that isn't design team or head sees read-only summary
  if (!isRoleAllowed) {
    return (
      <div className="space-y-4 max-w-3xl">
        {/* Illustrations */}
        {designFiles.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Design Illustrations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {designFiles.map((file, idx) => (
                  <button key={file.id} onClick={() => setLightboxIdx(idx)}
                    className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50 hover:border-blue-400 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={file.file_url} alt={file.name} className="w-full h-full object-cover" />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center py-0.5 px-1 truncate pointer-events-none" title={file.name}>
                      {file.colour_tag ? `${file.colour_tag} — ${file.name}` : file.name}
                    </div>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <Plus className="h-5 w-5 text-white rotate-45 scale-150" />
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        {lightboxIdx !== null && (
          <ImageLightbox images={lightboxImages} index={lightboxIdx} onClose={() => setLightboxIdx(null)} onNavigate={setLightboxIdx} />
        )}

        {/* Tech Pack summary — only visible once at least one illustration is approved */}
        {data && !hasAnyApproved && designFiles.length > 0 && (
          <Card className="border-gray-100 bg-gray-50">
            <CardContent className="pt-4 pb-4 flex items-center gap-3 text-gray-400">
              <Lock className="h-4 w-4 shrink-0" />
              <p className="text-sm">Tech pack is locked until illustrations are approved.</p>
            </CardContent>
          </Card>
        )}
        {data && hasAnyApproved && (
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Design Tech Pack</CardTitle>
            </CardHeader>
            <CardContent>
              {forms.length > 1 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {forms.map((f: any, i: number) => (
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
              <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-sm">
                {([
                  ['Designer', activeVariant.designer_name],
                  ['Sample Color', activeVariant.sample_color],
                  ['Farma', activeVariant.farma],
                  ['Season Year', activeVariant.season_year],
                  ['Fabric', activeVariant.fabric],
                  ['Lining', activeVariant.lining],
                  ['Air Mesh', activeVariant.air_mesh],
                  ['Zipper', activeVariant.zipper],
                  ['Puller', activeVariant.puller],
                  ['9mm Patta', activeVariant.patta_9mm],
                  ['Patta 1', activeVariant.patta_1],
                  ['Patta 2', activeVariant.patta_2],
                  ['Lader Lock', activeVariant.lader_lock],
                  ['Branding', activeVariant.branding],
                  ['Screen Print', activeVariant.screen_print],
                  ['Digital Print', activeVariant.digital_print],
                  ['Bartech', activeVariant.bartech],
                  ['Re-sampling By', activeVariant.re_sampling_by],
                ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
                    <p className="text-gray-800">{value}</p>
                  </div>
                ))}
              </div>

              {activeVariant.color_skus && activeVariant.color_skus.length > 0 && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Color SKUs</p>
                  <div className="flex flex-wrap gap-1.5">
                    {activeVariant.color_skus.map((sku: string) => (
                      <span key={sku} className="text-xs font-mono bg-violet-100 text-violet-800 px-2.5 py-0.5 rounded-full">{sku}</span>
                    ))}
                  </div>
                </div>
              )}

              {activeVariant.unique_feature && (
                <div className="mt-4 pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Unique Feature / USP</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{activeVariant.unique_feature}</p>
                </div>
              )}

              {activeVariant.remarks && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Remarks</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{activeVariant.remarks}</p>
                </div>
              )}
              {(!activeVariant.fabric && !activeVariant.designer_name && !activeVariant.farma) && (
                <p className="text-sm text-gray-400 italic">Tech pack not yet uploaded by design team.</p>
              )}
            </CardContent>
          </Card>
        )}
        {!data && (
          <div className="py-10 text-center text-gray-400">
            <p className="text-sm">Design data not yet available.</p>
          </div>
        )}
      </div>
    )
  }

  // ── Step progress stepper (designer + head view only) ──────────────────
  const steps = (isAssignedToMe || isHead) ? [
    { label: 'Illustrations',  done: hasAnyApproved,   active: !hasAnyApproved },
    { label: 'Approval',       done: imageApproved,    active: hasAnyApproved && !imageApproved },
    { label: 'Tech Pack',      done: hasTechPack,      active: imageApproved && !hasTechPack },
    { label: 'Variant Images', done: hasVariantImages, active: hasTechPack && !hasVariantImages },
  ] : null

  return (
    <div className="space-y-4">

      {/* ── Workflow Progress Stepper ──────────────────────────────── */}
      {steps && (
        <div className="bg-white border border-gray-100 rounded-xl px-5 py-4 shadow-sm">
          <div className="flex items-center justify-between">
            {steps.map((s, i) => (
              <div key={i} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1.5 shrink-0">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                    s.done   ? 'bg-green-500 border-green-500 text-white' :
                    s.active ? 'bg-blue-600 border-blue-600 text-white' :
                               'bg-white border-gray-200 text-gray-400'
                  }`}>
                    {s.done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </div>
                  <span className={`text-[10px] font-medium text-center leading-tight max-w-[70px] ${
                    s.done ? 'text-green-600' : s.active ? 'text-blue-600' : 'text-gray-400'
                  }`}>{s.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 mb-5 rounded ${s.done ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Sampling Gate ─────────────────────────────────────────────────── */}
      {(isAssignedToMe || isHead) && !data?.is_locked && !data?.is_completed && (
        <Card className={cn(
          'border-2',
          samplingApproved  ? 'border-green-300 bg-green-50'  :
          samplingRejected  ? 'border-red-300 bg-red-50'      :
          samplingSent      ? 'border-yellow-200 bg-yellow-50' :
          hasAnyApproved    ? 'border-violet-200 bg-violet-50' :
          'border-gray-200 bg-gray-50',
        )}>
          <CardContent className="pt-4 pb-4">
            {/* Not sent yet */}
            {samplingStatus === 'not_started' && (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Send for Sampling</p>
                  {!hasAnyApproved ? (
                    <p className="text-xs text-gray-400 mt-0.5">Illustrations must be approved by the design head first.</p>
                  ) : !hasTechPack ? (
                    <p className="text-xs text-orange-600 mt-0.5">Upload the tech pack above before sending for sampling.</p>
                  ) : (
                    <p className="text-xs text-violet-700 mt-0.5">
                      {designFiles.filter(f => f.review_status === 'approved').length} illustration(s) approved &amp; tech pack ready — click to send.
                    </p>
                  )}
                </div>
                {hasAnyApproved && hasTechPack && (
                  <Button
                    size="sm"
                    onClick={sendForSampling}
                    disabled={sendingSampling}
                    className="bg-violet-600 hover:bg-violet-700 shrink-0"
                  >
                    {sendingSampling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send for Sampling
                  </Button>
                )}
              </div>
            )}

            {/* Sent — waiting for sampling team */}
            {samplingSent && (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-yellow-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-yellow-900">Sent to Sampling Team</p>
                    <p className="text-xs text-yellow-700 mt-0.5">
                      The sampling team is creating physical samples. If you have uploaded a new variant, you can send it too.
                    </p>
                  </div>
                </div>
                {hasAnyApproved && hasTechPack && (isAssignedToMe || isHead) && (
                  <Button
                    size="sm"
                    onClick={sendForSampling}
                    disabled={sendingSampling}
                    variant="outline"
                    className="border-yellow-400 text-yellow-800 hover:bg-yellow-50 shrink-0"
                  >
                    {sendingSampling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Send Another Variant
                  </Button>
                )}
              </div>
            )}

            {/* Approved — design can be marked complete */}
            {samplingApproved && (
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-green-800">Sample Approved</p>
                  <p className="text-xs text-green-700 mt-0.5">
                    Physical sample passed. You can now mark design as complete — product will advance directly to Merchandising.
                  </p>
                </div>
              </div>
            )}

            {/* Rejected — needs revision */}
            {samplingRejected && (
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Sample Rejected</p>
                  {samplingData?.designer_feedback && (
                    <p className="text-xs text-red-700 mt-0.5 italic">&ldquo;{samplingData.designer_feedback}&rdquo;</p>
                  )}
                  <p className="text-xs text-red-600 mt-1">Review the feedback, update the design if needed, and send for sampling again.</p>
                  {(isAssignedToMe || isHead) && (
                    <Button size="sm" onClick={sendForSampling} disabled={sendingSampling} className="mt-2 bg-red-600 hover:bg-red-700 h-7 text-xs">
                      {sendingSampling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                      Resend for Sampling
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Design Head: Assignment + Review Queue (reviewer mode only) ── */}
      {isHead && !isHeadCreatorMode && (
        <>
          {/* Sales Requirement Summary */}
          {salesData && (
            <Card className="border-blue-200 bg-blue-50">
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm text-blue-900">Sales Requirement</CardTitle>
              </CardHeader>
              <CardContent className="pb-4 grid grid-cols-3 gap-x-6 gap-y-3">
                <div>
                  <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-0.5">Channel</p>
                  <p className="text-sm text-blue-900">{salesData.channel || <span className="text-blue-300 italic">—</span>}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-0.5">Price Range</p>
                  <p className="text-sm text-blue-900">{salesData.price_range ? `₹${salesData.price_range}` : <span className="text-blue-300 italic">—</span>}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-0.5">Deadline</p>
                  <p className="text-sm text-blue-900">
                    {salesData.deadline_date
                      ? new Date(salesData.deadline_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                      : <span className="text-blue-300 italic">—</span>}
                  </p>
                </div>
                {salesData.product_specification && (
                  <div className="col-span-3">
                    <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-0.5">Product Specification</p>
                    <p className="text-sm text-blue-900 whitespace-pre-wrap">{salesData.product_specification}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Assignment + Head Notes */}
          <Card className="border-violet-200 bg-violet-50">
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2 text-violet-900">
                  <UserCheck className="h-4 w-4" />
                  {data?.assigned_to
                    ? <>Assigned to: <strong>{data.assigned_to === profile.id ? 'Me' : designers.find(d => d.id === data.assigned_to)?.full_name || 'Unknown'}</strong></>
                    : 'Assign Designer'}
                  {savingAssign && <Loader2 className="h-4 w-4 animate-spin ml-1" />}
                </CardTitle>
                {/* Only show Change button when someone is already assigned */}
                {data?.assigned_to && (
                  <button
                    onClick={() => setShowReassign(v => !v)}
                    className="text-xs text-violet-600 hover:text-violet-800 underline"
                  >
                    {showReassign ? 'Cancel' : 'Change'}
                  </button>
                )}
              </div>
            </CardHeader>
            <CardContent className="pb-4 space-y-4">
              {/* Show full picker only when: no designer yet, or head clicked "Change" */}
              {(!data?.assigned_to || showReassign) && (
                designers.length === 0 ? (
                  <p className="text-xs text-violet-500">No active designers found.</p>
                ) : (
                  <div className="flex items-center gap-3">
                    <Select value={assignedTo} onValueChange={v => setAssignedTo(v)} disabled={savingAssign}>
                      <SelectTrigger className="w-56 bg-white">
                        <SelectValue placeholder="Select designer..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Unassigned —</SelectItem>
                        <SelectItem value={profile.id} className="font-medium text-violet-700">★ Assign to Me</SelectItem>
                        {designers.map(d => {
                          const count = designerWorkloads?.[d.id] ?? 0
                          return (
                            <SelectItem key={d.id} value={d.id}>
                              {d.full_name}
                              {count > 0 && (
                                <span className={`ml-2 text-xs font-medium px-1.5 py-0.5 rounded-full ${count >= 5 ? 'bg-red-100 text-red-600' : count >= 3 ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                                  {count} active
                                </span>
                              )}
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={() => { saveAssignment(assignedTo); setShowReassign(false) }}
                      disabled={savingAssign}
                      className="bg-violet-600 hover:bg-violet-700"
                    >
                      {savingAssign ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                      {data?.assigned_to ? 'Reassign' : 'Assign'}
                    </Button>
                  </div>
                )
              )}

              <div className="space-y-1.5">
                <Label className="text-xs text-violet-700 font-semibold uppercase tracking-wide">Remarks for Designer</Label>
                <Textarea
                  placeholder="Add instructions, references, or notes for the assigned designer..."
                  value={headNotes}
                  onChange={e => setHeadNotes(e.target.value)}
                  rows={3}
                  className="bg-white text-sm"
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={saveHeadNotes} disabled={savingNotes} className="h-7 text-xs">
                    {savingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                    Save Remarks
                  </Button>
                  {notesSaved && <span className="text-xs text-green-600">Saved.</span>}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Image Review Queue — designer submissions only (not head uploads) */}
          {(() => {
            const isHeadUpload  = (f: typeof designFiles[0]) => (f.uploader as unknown as { role?: string } | null)?.role === 'design_head'
            const pendingFiles  = designFiles.filter(f => f.review_status === 'pending'  && !isHeadUpload(f))
            const rejectedFiles = designFiles.filter(f => f.review_status === 'rejected' && !isHeadUpload(f))
            const approvedFiles = designFiles.filter(f => f.review_status === 'approved' && !isHeadUpload(f))
            const reviewableFiles = [...pendingFiles, ...rejectedFiles]
            return (
              <Card className="border-violet-200">
                <CardHeader className="pb-2 pt-4 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm text-violet-900 flex items-center gap-2">
                    Design Submissions for Review
                    {pendingFiles.length > 0 && (
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-yellow-400 text-white text-xs font-bold">
                        {pendingFiles.length}
                      </span>
                    )}
                  </CardTitle>
                  {pendingFiles.length >= 2 && (
                    <Button
                      size="sm"
                      className="h-7 text-xs bg-green-600 hover:bg-green-700"
                      disabled={approvingAll}
                      onClick={() => approveAll(pendingFiles)}
                    >
                      {approvingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Approve All ({pendingFiles.length})
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="pb-4 space-y-3">
                  {designFiles.length === 0 && (
                    <p className="text-sm text-gray-400 py-2">No illustrations uploaded yet — designer will upload and submit.</p>
                  )}
                  {designFiles.length > 0 && reviewableFiles.length === 0 && (
                    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2.5 border border-green-200">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      All {approvedFiles.length} illustration{approvedFiles.length !== 1 ? 's' : ''} approved — nothing left to review.
                    </div>
                  )}
                  {reviewableFiles.map(file => (
                    <div key={file.id} className={`border rounded-lg overflow-hidden ${
                      file.review_status === 'rejected' ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'
                    }`}>
                      <div className="flex items-start gap-3 p-3">
                        <button
                          onClick={() => setLightboxIdx(designFiles.indexOf(file))}
                          className="relative shrink-0 w-24 h-24 rounded-md overflow-hidden border border-gray-200 bg-gray-50 hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-400"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={file.file_url} alt={file.name} className="w-full h-full object-cover" />
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                            {file.review_status === 'rejected' && (
                              <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                                <XCircle className="h-3 w-3" /> Rejected
                              </span>
                            )}
                            {file.review_status === 'pending' && (
                              <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                                <Clock className="h-3 w-3" /> Awaiting review
                              </span>
                            )}
                          </div>
                          {file.review_feedback && (
                            <p className="text-xs text-red-700 mb-2">Feedback: {file.review_feedback}</p>
                          )}
                          {file.review_status === 'pending' && (
                            <div className="flex items-start gap-2 mt-1">
                              <Button
                                size="sm"
                                className="bg-green-600 hover:bg-green-700 h-7 text-xs"
                                disabled={reviewingFileId === file.id}
                                onClick={() => reviewImage(file.id, 'approved')}
                              >
                                {reviewingFileId === file.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                Approve
                              </Button>
                              {showFileRejectBox === file.id ? (
                                <div className="flex-1 space-y-1.5">
                                  <Textarea
                                    placeholder="Reason for rejection (optional)…"
                                    rows={2}
                                    className="text-xs bg-white"
                                    value={fileRejectFeedback[file.id] || ''}
                                    onChange={e => setFileRejectFeedback(prev => ({ ...prev, [file.id]: e.target.value }))}
                                  />
                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      className="h-7 text-xs"
                                      disabled={reviewingFileId === file.id}
                                      onClick={() => reviewImage(file.id, 'rejected', fileRejectFeedback[file.id])}
                                    >
                                      {reviewingFileId === file.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                      Confirm Reject
                                    </Button>
                                    <Button size="sm" variant="outline" className="h-7 text-xs bg-white" onClick={() => setShowFileRejectBox(null)}>
                                      Cancel
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs text-red-600 border-red-200 bg-white"
                                  onClick={() => setShowFileRejectBox(file.id)}
                                >
                                  <XCircle className="h-3 w-3" /> Reject
                                </Button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  {/* Approved summary — compact thumbnails, clickable via lightbox */}
                  {approvedFiles.length > 0 && (
                    <div className="pt-1">
                      <p className="text-xs font-medium text-green-700 mb-2 flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5" /> {approvedFiles.length} illustration{approvedFiles.length !== 1 ? 's' : ''} already approved
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {approvedFiles.map(f => (
                          <button key={f.id} onClick={() => setLightboxIdx(designFiles.indexOf(f))}
                            className="relative w-14 h-14 rounded-md overflow-hidden border-2 border-green-300 bg-gray-50 hover:opacity-80 transition-opacity focus:outline-none focus:ring-2 focus:ring-green-400"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={f.file_url} alt={f.name} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {submissions.length > 0 && designFiles.length > 0 && !designFiles.some(f => f.review_status) && (
                    <p className="text-xs text-gray-400 pt-1">Images uploaded but not yet submitted for review by the designer.</p>
                  )}
                </CardContent>
              </Card>
            )
          })()}
        </>
      )}

      {/* ── Management: review design head illustrations ─────────── */}
      {isManagement && (() => {
        const headFiles = designFiles.filter(f =>
          (f.uploader as unknown as { role?: string } | null)?.role === 'design_head'
        )
        const pendingHead   = headFiles.filter(f => f.review_status === 'pending')
        const rejectedHead  = headFiles.filter(f => f.review_status === 'rejected')
        const approvedHead  = headFiles.filter(f => f.review_status === 'approved')
        const reviewable    = [...pendingHead, ...rejectedHead]
        if (headFiles.length === 0) return null
        return (
          <Card className="border-blue-200">
            <CardHeader className="pb-2 pt-4 flex flex-row items-center justify-between">
              <CardTitle className="text-sm text-blue-900 flex items-center gap-2">
                Design Head Illustrations — Management Review
                {pendingHead.length > 0 && (
                  <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-yellow-400 text-white text-xs font-bold">
                    {pendingHead.length}
                  </span>
                )}
              </CardTitle>
              {pendingHead.length >= 2 && (
                <Button
                  size="sm"
                  className="h-7 text-xs bg-green-600 hover:bg-green-700"
                  disabled={approvingAll}
                  onClick={() => approveAll(pendingHead)}
                >
                  {approvingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                  Approve All ({pendingHead.length})
                </Button>
              )}
            </CardHeader>
            <CardContent className="pb-4 space-y-3">
              {reviewable.length === 0 && approvedHead.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2.5 border border-green-200">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  All {approvedHead.length} illustration{approvedHead.length !== 1 ? 's' : ''} approved.
                </div>
              )}
              {reviewable.map(file => (
                <div key={file.id} className={`border rounded-lg overflow-hidden ${
                  file.review_status === 'rejected' ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'
                }`}>
                  <div className="flex items-start gap-3 p-3">
                    <button
                      onClick={() => setLightboxIdx(designFiles.indexOf(file))}
                      className="relative shrink-0 w-24 h-24 rounded-md overflow-hidden border border-gray-200 bg-gray-50 hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={file.file_url} alt={file.name} className="w-full h-full object-cover" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                        {file.review_status === 'rejected' && (
                          <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                            <XCircle className="h-3 w-3" /> Rejected
                          </span>
                        )}
                        {file.review_status === 'pending' && (
                          <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                            <Clock className="h-3 w-3" /> Awaiting review
                          </span>
                        )}
                      </div>
                      {file.review_feedback && (
                        <p className="text-xs text-red-700 mb-2">Feedback: {file.review_feedback}</p>
                      )}
                      {file.review_status === 'pending' && (
                        <div className="flex items-start gap-2 mt-1">
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 h-7 text-xs"
                            disabled={reviewingFileId === file.id}
                            onClick={() => reviewImage(file.id, 'approved')}
                          >
                            {reviewingFileId === file.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                            Approve
                          </Button>
                          {showFileRejectBox === file.id ? (
                            <div className="flex-1 space-y-1.5">
                              <textarea
                                placeholder="Reason for rejection (optional)…"
                                rows={2}
                                className="w-full text-xs bg-white border border-gray-200 rounded px-2 py-1 resize-none"
                                value={fileRejectFeedback[file.id] || ''}
                                onChange={e => setFileRejectFeedback(prev => ({ ...prev, [file.id]: e.target.value }))}
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm" variant="destructive" className="h-7 text-xs"
                                  disabled={reviewingFileId === file.id}
                                  onClick={() => reviewImage(file.id, 'rejected', fileRejectFeedback[file.id])}
                                >
                                  {reviewingFileId === file.id ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                  Confirm Reject
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-xs bg-white" onClick={() => setShowFileRejectBox(null)}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Button
                              size="sm" variant="outline"
                              className="h-7 text-xs text-red-600 border-red-200 bg-white"
                              onClick={() => setShowFileRejectBox(file.id)}
                            >
                              <XCircle className="h-3 w-3" /> Reject
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {approvedHead.length > 0 && reviewable.length > 0 && (
                <div className="pt-1">
                  <p className="text-xs font-medium text-green-700 mb-2 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {approvedHead.length} illustration{approvedHead.length !== 1 ? 's' : ''} already approved
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {approvedHead.map(f => (
                      <button key={f.id} onClick={() => setLightboxIdx(designFiles.indexOf(f))}
                        className="relative w-14 h-14 rounded-md overflow-hidden border-2 border-green-300 bg-gray-50 hover:opacity-80 transition-opacity"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.file_url} alt={f.name} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })()}

      {/* ── Unassigned / wrong-assignee notice for designers ─────── */}
      {isTeamMember && !isAssignedToMe && !data?.is_locked && !data?.is_completed && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <UserCheck className="h-5 w-5 text-amber-500 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Awaiting assignment</p>
                <p className="text-xs text-amber-700">The design head has not yet assigned this product. You will be notified when it is assigned to you.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Batch hold indicator ──────────────────────────────────── */}
      {data?.is_completed && batchPending.length > 0 && (isAssignedToMe || isHead) && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Clock className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-blue-900">Design complete — waiting for batch</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  This product will advance to Sampling once the following {batchPending.length === 1 ? 'product is' : `${batchPending.length} products are`} also complete:
                </p>
                <ul className="mt-2 space-y-1">
                  {batchPending.map(s => (
                    <li key={s.id} className="text-xs text-blue-800 font-medium flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shrink-0" />
                      {s.name}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Head Remarks visible to designers ─────────────────────── */}
      {isAssignedToMe && data?.head_notes && (
        <Card className="border-violet-200 bg-violet-50">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-violet-400 uppercase tracking-wide mb-1">Remarks from Design Head</p>
            <p className="text-sm text-violet-900 whitespace-pre-wrap">{data.head_notes}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Illustrations (team members + head acting as designer) ── */}
      {(isAssignedToMe || isHead) && (
        <div className="flex items-center gap-3">
          <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${hasAnyApproved ? 'bg-green-500 text-white' : 'bg-blue-600 text-white'}`}>
            {hasAnyApproved ? <CheckCircle2 className="h-3.5 w-3.5" /> : '1'}
          </div>
          <p className="text-sm font-semibold text-gray-700">
            {isHead
              ? (designFiles.some(f => (f.uploader as any)?.role !== 'design_head')
                  ? 'Review Designer Illustrations'
                  : 'Upload Your Illustrations')
              : 'Upload & Get Illustrations Approved'}
          </p>
        </div>
      )}
      {(isAssignedToMe || isHead) && <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">Illustrations</CardTitle>
            {isHead && designFiles.every(f => (f.uploader as any)?.role === 'design_head') && (
              <p className="text-xs text-amber-600 mt-0.5">Your uploads are sent to management for approval</p>
            )}
          </div>
          {canUploadIllos && (
            <Button size="sm" variant="outline" onClick={() => illustrationRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploadProgress ? `${uploadProgress.done}/${uploadProgress.total} uploaded` : uploading ? 'Uploading…' : 'Upload'}
            </Button>
          )}
          <input ref={illustrationRef} type="file" accept="image/*" multiple className="hidden" onChange={handleIllustrationUpload} />
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Variant tabs — when multiple variants, uploading on a tab auto-tags to that variant */}
          {forms.length > 1 ? (
            <div className="flex flex-wrap gap-2 pb-2 border-b border-gray-100">
              {forms.map((v: any, i: number) => {
                const token = variantColorToken(v.sample_color || '')
                const count = designFiles.filter(f => {
                  const ct = (f.colour_tag || '').trim().toLowerCase()
                  if (!ct) return false
                  const ctToken = ct.includes(' — ') ? (ct.split(' — ').pop()?.trim() ?? ct) : ct
                  return ctToken === token.toLowerCase() || ct === token.toLowerCase()
                }).length
                return (
                  <button
                    key={i}
                    onClick={() => setActiveIlloVariantIdx(i)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                      i === activeIlloVariantIdx
                        ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:bg-purple-50'
                    }`}
                  >
                    Design {i + 1}
                    {count > 0 && (
                      <span className={`rounded-full px-1.5 text-[10px] font-bold ${i === activeIlloVariantIdx ? 'bg-purple-400 text-white' : 'bg-gray-200 text-gray-600'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
              {canUploadIllos && (
                <span className="text-[10px] text-gray-400 self-center ml-1">
                  Uploading goes to <strong>Design {activeIlloVariantIdx + 1}</strong>
                </span>
              )}
            </div>
          ) : canUploadIllos ? (
            /* Single variant: keep the manual colour tag input */
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-gray-500 shrink-0">Colour / Variant for next upload:</span>
              {allColorSkus.length > 0 ? (
                <Select value={illoColorTag || "all_colours"} onValueChange={(val) => setIlloColorTag(val === "all_colours" ? "" : val)}>
                  <SelectTrigger className="h-7 text-xs w-40 bg-white">
                    <SelectValue placeholder="All colours" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all_colours">All colours</SelectItem>
                    {allColorSkus.map((sku: any) => (
                      <SelectItem key={sku} value={sku}>{sku}</SelectItem>
                    ))}
                    {allSampleColors.filter(sc => !allColorSkus.includes(sc)).map((sc: any) => (
                      <SelectItem key={sc} value={sc}>{sc} (sample)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="e.g. Black, Blue, Red…"
                  value={illoColorTag}
                  onChange={e => setIlloColorTag(e.target.value)}
                  className="h-7 text-xs w-40"
                />
              )}
              <span className="text-[10px] text-gray-400">Tag tells sampling which colour each illustration is for</span>
            </div>
          ) : null}
          {/* Upload progress */}
          {uploadProgress && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between text-sm text-blue-700 font-medium">
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Uploading {uploadingName || 'images'}…</span>
                <span>{uploadProgress.done} / {uploadProgress.total}</span>
              </div>
              <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all duration-300" style={{ width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%` }} />
              </div>
            </div>
          )}
          {uploadSuccess !== null && !uploadProgress && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 flex items-center gap-2 text-sm text-green-700 font-medium">
              <CheckCircle2 className="h-4 w-4" /> {uploadSuccess} illustration{uploadSuccess !== 1 ? 's' : ''} uploaded successfully
            </div>
          )}
          {visibleDesignFiles.length === 0 ? (
            <div
              className={`border-2 border-dashed rounded-xl py-10 text-center ${canUploadIllos ? 'border-gray-200 cursor-pointer hover:border-purple-300 hover:bg-purple-50 transition-colors' : 'border-gray-100'}`}
              onClick={() => canUploadIllos && illustrationRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 font-medium">Upload design illustrations</p>
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, GIF, WEBP supported</p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {visibleDesignFiles.map((file, idx) => (
                  <div key={file.id} className={`relative group rounded-lg overflow-hidden aspect-square bg-gray-50 border-2 ${
                    file.review_status === 'approved' ? 'border-green-400' :
                    file.review_status === 'rejected' ? 'border-red-400' :
                    file.review_status === 'pending'  ? 'border-yellow-400' :
                    'border-gray-200'
                  }`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={file.file_url} alt={file.name} className="w-full h-full object-cover cursor-pointer" onClick={() => setLightboxIdx(idx)} />
                    {/* Status badge */}
                    {file.review_status && (
                      <div className={`absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium pointer-events-none ${
                        file.review_status === 'approved' ? 'bg-green-500 text-white' :
                        file.review_status === 'rejected' ? 'bg-red-500 text-white' :
                        'bg-yellow-500 text-white'
                      }`}>
                        {file.review_status === 'approved' ? <CheckCircle2 className="h-3 w-3" /> :
                         file.review_status === 'rejected' ? <XCircle className="h-3 w-3" /> :
                         <Clock className="h-3 w-3" />}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 pointer-events-none">
                      {canUploadIllos && (
                        <>
                          {/* Colour tag dropdown */}
                          {(allColorSkus.length > 0 || allSampleColors.length > 0) && taggingFileId === file.id ? (
                            <div className="flex gap-1 pointer-events-auto">
                              <Select value={file.colour_tag || ''} onValueChange={(val) => tagIllustration(file.id, val || null)}>
                                <SelectTrigger className="h-7 w-32 text-xs bg-white">
                                  <SelectValue placeholder="Tag colour…" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="">—</SelectItem>
                                  {allColorSkus.map((sku: any) => (
                                    <SelectItem key={sku} value={sku}>{sku}</SelectItem>
                                  ))}
                                  {allSampleColors.filter(sc => !allColorSkus.includes(sc)).map((sc: any) => (
                                    <SelectItem key={sc} value={sc}>{sc}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <button
                              className="h-7 w-7 rounded-full bg-white flex items-center justify-center hover:bg-violet-50 pointer-events-auto"
                              onClick={e => { e.stopPropagation(); setTaggingFileId(file.id) }}
                              title="Tag colour"
                            >
                              <span className="text-xs font-semibold text-violet-600">🏷️</span>
                            </button>
                          )}
                        </>
                      )}
                      {canUploadIllos && file.review_status !== 'approved' && (
                        <button
                          className="h-7 w-7 rounded-full bg-white flex items-center justify-center hover:bg-red-50 pointer-events-auto"
                          onClick={e => { e.stopPropagation(); deleteFile(file) }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </button>
                      )}
                    </div>
                    {/* Colour tag label — always visible at bottom */}
                    {file.review_status === 'rejected' && file.review_feedback ? (
                      <p className="absolute bottom-0 left-0 right-0 px-2 py-1 text-xs text-white bg-red-600/80 truncate pointer-events-none" title={file.review_feedback}>{file.review_feedback}</p>
                    ) : (
                      <div className={cn(
                        "absolute bottom-0 left-0 right-0 text-white text-[9px] text-center py-0.5 px-1 truncate pointer-events-none",
                        file.colour_tag ? "bg-violet-700/80 font-semibold" : "bg-black/60"
                      )} title={file.name}>
                        {file.colour_tag ? `${file.colour_tag} — ${file.name}` : file.name}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {canUploadIllos && (!isHead || designFiles.every(f => (f.uploader as any)?.role === 'design_head')) && (
                <button onClick={() => illustrationRef.current?.click()}
                  className="w-full py-2 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:text-purple-500 hover:border-purple-300 transition-colors"
                >
                  + Add more illustrations
                </button>
              )}
            </div>
          )}
        </CardContent>
      </Card>}

      {/* ── Submit for Management Approval (design head creator mode) ── */}
      {isHeadCreatorMode && !data?.is_locked && !data?.is_completed && (
        <Card className={imageApproved ? 'border-green-200 bg-green-50' : 'border-violet-200 bg-violet-50'}>
          <CardContent className="pt-4 pb-4">
            {imageApproved ? (
              <div className="flex items-center gap-3 text-green-700">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">All illustrations approved by management</p>
                  <p className="text-xs text-green-600">You can now fill the tech pack below.</p>
                </div>
              </div>
            ) : designFiles.some(f => f.review_status === 'pending') ? (
              <div className="flex items-center gap-3 text-violet-700">
                <Clock className="h-5 w-5 shrink-0 animate-pulse" />
                <div>
                  <p className="text-sm font-semibold">Submitted — awaiting management approval</p>
                  <p className="text-xs text-violet-600 mt-0.5">You can add more illustrations while waiting.</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Submit Illustrations for Management Approval</p>
                  {designFiles.some(f => f.review_status === 'rejected') && (
                    <p className="text-xs text-red-600 mt-0.5">Some illustrations were rejected — upload revisions, then resubmit.</p>
                  )}
                  {designFiles.length === 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">Upload your illustrations above, then submit for approval.</p>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={submitForReview}
                  disabled={submitting || designFiles.length === 0}
                  className="shrink-0 bg-violet-600 hover:bg-violet-700"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {submitDone ? 'Submitted!' : 'Submit for Approval'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Submit for Review (design team members only) ──────────── */}
      {isAssignedToMe && !data?.is_locked && !data?.is_completed && (
        <Card className={imageApproved ? 'border-green-200 bg-green-50' : 'border-gray-200'}>
          <CardContent className="pt-4 pb-4">
            {imageApproved ? (
              <div className="flex items-center gap-3 text-green-700">
                <CheckCircle2 className="h-5 w-5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold">All illustrations approved — upload tech pack below</p>
                  <p className="text-xs text-green-600">Your illustrations were approved by the design head.</p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-gray-800">Submit Illustrations for Review</p>
                  {designFiles.some(f => f.review_status === 'pending') && (
                    <p className="text-xs text-yellow-600 mt-0.5 flex items-center gap-1"><Clock className="h-3 w-3" /> Some illustrations are awaiting the design head&apos;s review. You can still submit or add more.</p>
                  )}
                  {!designFiles.some(f => f.review_status === 'pending') && designFiles.some(f => f.review_status === 'rejected') && (
                    <p className="text-xs text-red-600 mt-0.5">Some images were rejected — remove them or upload revisions, then resubmit.</p>
                  )}
                  {!designFiles.some(f => f.review_status) && (
                    <p className="text-xs text-gray-500 mt-0.5">Upload your design images above, then submit for the design head&apos;s approval.</p>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={submitForReview}
                  disabled={submitting || designFiles.length === 0}
                  className="shrink-0"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  {submitDone ? 'Submitted!' : 'Submit for Review'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Tech Pack Upload ── */}
      {/* Locked placeholder — shown in creator mode before approval */}
      {(isAssignedToMe || (isHead && isHeadCreatorMode)) && !canEditFields && (
        <div className="flex items-center gap-3 mt-2 opacity-40">
          <div className="h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 bg-gray-200 text-gray-400">
            2
          </div>
          <p className="text-sm font-semibold text-gray-400">Tech Pack & Variant Details — locked until illustrations are approved</p>
        </div>
      )}
      {(isAssignedToMe || isHead) && canEditFields && (
        <div className="flex items-center gap-3 mt-2">
          <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${hasTechPack ? 'bg-green-500 text-white' : imageApproved ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-400'}`}>
            {hasTechPack ? <CheckCircle2 className="h-3.5 w-3.5" /> : '2'}
          </div>
          <p className={`text-sm font-semibold ${imageApproved ? 'text-gray-700' : 'text-gray-400'}`}>
            {isHead && designFiles.some(f => (f.uploader as any)?.role !== 'design_head')
              ? 'Tech Pack & Variant Details (designer fills this)'
              : 'Upload Tech Pack & Fill Variant Details'}
          </p>
        </div>
      )}
      {(isAssignedToMe || isHead) && canEditFields && (
        <Card className="border-purple-200 bg-purple-50">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-purple-900">Upload Tech Pack</p>
                  <p className="text-xs text-purple-700">Excel auto-fills fields &amp; extracts variant images · PDF stored as reference</p>
                </div>
              </div>
              <Button size="sm" onClick={() => techPackRef.current?.click()} disabled={parsingTechPack} className="bg-purple-600 hover:bg-purple-700 shrink-0">
                {parsingTechPack ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {parsingTechPack ? 'Uploading…' : 'Upload Tech Pack'}
              </Button>
              <input ref={techPackRef} type="file" accept=".xlsx,.xls,.pdf,application/pdf" className="hidden" onChange={handleTechPackUpload} />
            </div>

            {/* Uploaded PDF link */}
            {techpackPdfUrl && (
              <div className="mt-3 pt-3 border-t border-purple-200 flex items-center gap-2">
                <FileText className="h-4 w-4 text-red-500 shrink-0" />
                <a
                  href={techpackPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline font-medium flex-1"
                >
                  Tech Pack PDF — click to view
                </a>
                <a href={techpackPdfUrl} target="_blank" rel="noopener noreferrer" download
                  className="text-xs text-gray-400 hover:text-blue-600 underline shrink-0">
                  <Download className="h-3.5 w-3.5" />
                </a>
              </div>
            )}

            {/* Upload result message */}
            {techPackResult && techPackVariants.length <= 1 && (
              <div className="mt-3 pt-3 border-t border-purple-200">
                {techPackResult.filled.length > 0 ? (
                  <div className="flex items-start gap-2 text-purple-800">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-purple-600" />
                    <p className="text-xs">
                      {techPackResult.isPdf
                        ? techPackResult.filled[0]
                        : `Filled: ${techPackResult.filled.join(', ')}. Review and save.`}
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-red-600">Could not extract data — check the file format.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Print Files Upload ── */}
      {(isAssignedToMe || isHead) && canEditFields && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base">Print Files</CardTitle>
            <div className="flex items-center gap-2">
              {printUploading && printProgress && (
                <span className="text-xs text-blue-600 flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {printProgress.done}/{printProgress.total} uploading…
                </span>
              )}
              <label className="cursor-pointer">
                <input
                  ref={printFileRef}
                  type="file"
                  accept="image/*,application/pdf"
                  multiple
                  className="hidden"
                  disabled={printUploading}
                  onChange={e => handlePrintUpload(Array.from(e.target.files || []))}
                />
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border ${printUploading ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50 cursor-pointer'}`}>
                  <Upload className="h-3 w-3" />
                  Upload Files
                </span>
              </label>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">

            {/* Uploaded print files grid */}
            {printFiles.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {printFiles.map((f, idx) => {
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
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end justify-between p-1.5 opacity-0 group-hover:opacity-100">
                        {!isPdf && <span className="text-[10px] text-white truncate max-w-[70%]">{f.name}</span>}
                        <span />
                        <button
                          onClick={e => { e.stopPropagation(); deleteFile(f) }}
                          className="h-5 w-5 rounded-full bg-red-500 flex items-center justify-center shrink-0"
                        >
                          <X className="h-3 w-3 text-white" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {printFiles.length === 0 && !printUploading && (
              <p className="text-xs text-gray-400 text-center">No print files uploaded yet.</p>
            )}
          </CardContent>
        </Card>
      )}
      {printLightboxIdx !== null && (
        <ImageLightbox
          images={printLightboxImages}
          index={printLightboxIdx}
          onClose={() => setPrintLightboxIdx(null)}
          onNavigate={setPrintLightboxIdx}
        />
      )}

      {/* Locked notice for team member before image approval */}
      {isAssignedToMe && !hasAnyApproved && !data?.is_locked && !data?.is_completed && (
        <p className="text-xs text-gray-400 text-center py-1">
          Tech pack and design form unlock after the design head approves your illustrations.
        </p>
      )}

      {/* ── Design Details form — hidden in creator mode until illustrations approved ── */}
      {(isAssignedToMe || isHead) && !(isHeadCreatorMode && !hasAnyApproved) && <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Design Details</CardTitle>
          <div className="flex items-center gap-2">
            <a
              href={`/api/export-design-techpack?product_id=${product.id}`}
              download
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Export Excel
            </a>
            {data?.is_locked && (
              <span className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
                <Lock className="h-3 w-3" /> Stage Locked
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Product identity */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Product</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Category</Label>
                <Select value={category} onValueChange={(v) => handleCategoryChange(v as ProductCategory)} disabled={!canEditFields}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(CATEGORY_LABELS) as [ProductCategory, string][]).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(CATEGORY_SUBCATEGORIES[category as ProductCategory] ?? []).length > 1 ? (
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Sub-Category</Label>
                <Select value={subCategory} onValueChange={setSubCategory} disabled={!canEditFields}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select sub-category" /></SelectTrigger>
                  <SelectContent>
                    {CATEGORY_SUBCATEGORIES[category as ProductCategory].map(sub => (
                      <SelectItem key={sub} value={sub}>{sub}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              ) : (
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Sub-Category</Label>
                <p className="h-8 flex items-center text-sm text-gray-500 px-1">{subCategory || <span className="text-gray-300 italic">—</span>}</p>
              </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Brand</Label>
                <Select value={brand} onValueChange={(v) => setBrand(v as Brand)} disabled={!canEditFields}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select brand" /></SelectTrigger>
                  <SelectContent>
                    {BRANDS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Channel</Label>
                <Select value={forms[0]?.channel || ""} onValueChange={(v) => setForms(prev => { const copy = [...prev]; copy[0] = { ...copy[0], channel: v }; return copy })} disabled={!canEditFields}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select channel" /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Family / Range Name</Label>
              {canEditFields ? (
                <Input
                  className="h-8 text-sm"
                  placeholder="e.g. Rock, Alpine, Summer 2026…"
                  value={familyName}
                  onChange={e => setFamilyName(e.target.value)}
                />
              ) : (
                <p className="h-8 flex items-center text-sm px-1">
                  {familyName || <span className="text-gray-300 italic">—</span>}
                </p>
              )}
            </div>
          </div>

          
          {forms.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {forms.map((f: any, i: number) => (
                <div key={i} className="relative group">
                  <button
                    onClick={() => setActiveVariantIdx(i)}
                    className={`pl-4 pr-7 py-2 rounded-full text-xs font-semibold border transition-all ${
                      i === activeVariantIdx
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    Variant {i + 1} {f.sample_color ? `(${f.sample_color})` : ''}
                  </button>
                  {canEditFields && (
                    <button
                      onClick={e => { e.stopPropagation(); deleteVariant(i) }}
                      title="Delete this variant"
                      className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 transition-colors ${
                        i === activeVariantIdx
                          ? 'text-blue-200 hover:text-white hover:bg-blue-500'
                          : 'text-gray-300 hover:text-red-500 hover:bg-red-50'
                      }`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {forms.map((form, formIdx) => (
  <div key={formIdx} className={`mb-8 border-t pt-6 first:border-0 first:pt-0 ${formIdx !== activeVariantIdx ? 'hidden' : ''}`}>
    <h3 className="text-sm font-bold text-gray-700 mb-4">Design Variant {formIdx + 1} {form.sample_color && `(${form.sample_color})`}</h3>
    {/* Tech Pack fields */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tech Pack</p>
            {/* Identity */}
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-3">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Identity</p>
            <div className="grid grid-cols-3 gap-3">
              {F({  label: "Designer Name", field: "designer_name" , formIdx })}
              {F({  label: "Style Name",   field: "style_name",    formIdx, placeholder: product.name })}
              {F({  label: "Farma", field: "farma", placeholder: "e.g. DAYSTEP", mono: true , formIdx })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {F({  label: "Season Year", field: "season_year", placeholder: "e.g. 2026-2027" , formIdx })}
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Sample Color</Label>
                <Input placeholder="e.g. Midnight Black" value={form.sample_color}
                  onChange={e => setForms(prev => { const copy = [...prev]; copy[formIdx] = { ...copy[formIdx], sample_color: e.target.value }; return copy })}
                  disabled={!canEditFields} className="h-8 text-sm" />
              </div>
            </div>
          </div>

          {/* Materials */}
          <div className="rounded-lg border border-blue-50 bg-blue-50/40 p-3 space-y-3">
            <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Materials</p>
            <div className="grid grid-cols-3 gap-3">
              {F({  label: "Fabric", field: "fabric", placeholder: "e.g. 600*600 PU-BLK" , formIdx })}
              {F({  label: "Lining", field: "lining", placeholder: "e.g. PLN LGR" , formIdx })}
              {F({  label: "Air Mesh", field: "air_mesh", placeholder: "YES / NO / NA" , formIdx })}
            </div>
          </div>

          {/* Hardware */}
          <div className="rounded-lg border border-violet-50 bg-violet-50/40 p-3 space-y-3">
            <p className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Hardware</p>
            <div className="grid grid-cols-3 gap-3">
              {F({  label: "Zipper", field: "zipper", placeholder: "e.g. 8 NO.-BLK" , formIdx })}
              {F({  label: "Puller", field: "puller", placeholder: "e.g. PVC PRIO NEW-BLK" , formIdx })}
              {F({  label: "9mm Patta", field: "patta_9mm", placeholder: "e.g. BLK+HANGER" , formIdx })}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {F({  label: "Patta 1", field: "patta_1", placeholder: 'e.g. 0.75"-BLK' , formIdx })}
              {F({  label: "Patta 2", field: "patta_2", placeholder: "e.g. NA" , formIdx })}
              {F({  label: "Lader Lock", field: "lader_lock", placeholder: 'e.g. 0.75"-BLK' , formIdx })}
            </div>
          </div>

          {/* Branding */}
          <div className="rounded-lg border border-amber-50 bg-amber-50/40 p-3 space-y-3">
            <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Branding</p>
            <div className="grid grid-cols-3 gap-3">
              {F({  label: "Branding", field: "branding", placeholder: "e.g. PBR PRIO HOPE-BLK-RED" , formIdx })}
              {F({  label: "Screen Print", field: "screen_print", placeholder: "YES / NO / NA" , formIdx })}
              {F({  label: "Digital Print", field: "digital_print", placeholder: "YES / NO / NA" , formIdx })}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {F({  label: "Bartech", field: "bartech", placeholder: "e.g. BLK" , formIdx })}
              {F({  label: "Add On 1", field: "add_on_1" , formIdx })}
              {F({  label: "Add On 2", field: "add_on_2" , formIdx })}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {F({  label: "Add On 3", field: "add_on_3" , formIdx })}
            </div>
          </div>

          {/* Notes */}
          <div className="rounded-lg border border-green-50 bg-green-50/40 p-3 space-y-3">
            <p className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Notes</p>
            <div className="grid grid-cols-2 gap-3">
              {F({  label: "Re-sampling By", field: "re_sampling_by" , formIdx })}
              {F({  label: "Designer Sign", field: "designer_sign" , formIdx })}
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Remarks <span className="text-gray-400 font-normal">(colour-specific differences, e.g. "BLACK: BLK zipper — GREEN: GRN zipper")</span></Label>
              <Textarea placeholder="e.g. BLACK: 8NO BLK zipper, BLK puller — GREEN: 8NO GRN zipper, GRN puller" value={form.remarks}
                onChange={e => setForms(prev => { const copy = [...prev]; copy[formIdx] = { ...copy[formIdx], remarks: e.target.value }; return copy })}
                disabled={!canEditFields} rows={2} className="text-sm" />
            </div>
          </div>

          {/* Colour SKUs */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Colour SKUs</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {(form.color_skus as string[]).map((sku: string, i: number) => (
                <span key={i} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full font-mono">
                  {sku}
                  {canEditFields && (
                    <button onClick={() => setForms(prev => { const copy = [...prev]; copy[formIdx] = { ...copy[formIdx], color_skus: copy[formIdx].color_skus.filter((_: any, j: number) => j !== i) }; return copy })}>
                      <X className="h-3 w-3 hover:text-red-500" />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {canEditFields && (
              <div className="flex gap-2">
                <Input placeholder="Add SKU…" value={newSku}
                  onChange={e => setNewSku(e.target.value.toUpperCase())}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newSku.trim()) {
                      setForms(prev => { const copy = [...prev]; copy[formIdx] = { ...copy[formIdx], color_skus: [...copy[formIdx].color_skus, newSku.trim()] }; return copy })
                      setNewSku('')
                    }
                  }}
                  className="font-mono h-8 text-sm"
                />
                <Button type="button" variant="outline" size="icon" className="h-8 w-8"
                  onClick={() => { if (newSku.trim()) { setForms(prev => { const copy = [...prev]; copy[formIdx] = { ...copy[formIdx], color_skus: [...copy[formIdx].color_skus, newSku.trim()] }; return copy }); setNewSku('') } }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {/* Variant Reference Image */}
          <div className="space-y-1.5 border-t pt-4 mt-2">
            <Label className="text-xs text-gray-500">Variant Reference Image</Label>
            <p className="text-xs text-gray-400">Upload a reference image for this colour variant — this is what the sampling team will see.</p>
            {(form as any).variant_image_url ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={(form as any).variant_image_url} alt="Variant reference" className="h-40 w-auto rounded-lg border border-gray-200 object-cover" />
                {canEditFields && (
                  <button
                    type="button"
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-0.5 hover:bg-red-600"
                    onClick={async () => {
                      const updatedForms = forms.map((f, i) => i === formIdx ? { ...f, variant_image_url: '' } : f)
                      setForms(updatedForms)
                      await supabase.from('design_data').update({ variants: updatedForms, updated_by: profile.id } as any).eq('product_id', product.id)
                      toast.success('Variant image removed.')
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ) : null}
            {canEditFields && (
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={variantImgUploading !== null}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setVariantImgUploading(formIdx)
                    const fd = new FormData()
                    fd.append('file', file)
                    fd.append('folder', `products/${product.id}/variant-images`)
                    const res = await fetch('/api/upload-file', { method: 'POST', body: fd })
                    if (res.ok) {
                      const { url } = await res.json() as { url: string }
                      const updatedForms = forms.map((f, i) => i === formIdx ? { ...f, variant_image_url: url } : f)
                      setForms(updatedForms)
                      await supabase.from('design_data').update({ variants: updatedForms, updated_by: profile.id } as any).eq('product_id', product.id)
                      toast.success('Variant image uploaded.')
                      router.refresh()
                    }
                    setVariantImgUploading(null)
                    e.target.value = ''
                  }}
                />
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border ${variantImgUploading === formIdx ? 'bg-gray-100 text-gray-400 border-gray-200' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}>
                  {variantImgUploading === formIdx ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                  {(form as any).variant_image_url ? 'Replace Image' : 'Upload Image'}
                </span>
              </label>
            )}
          </div>

          {/* Unique Feature / USP */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Unique Feature / USP</Label>
            <Textarea placeholder="Unique selling point or feature…"
              value={form.unique_feature}
              onChange={e => setForms(prev => { const copy = [...prev]; copy[formIdx] = { ...copy[formIdx], unique_feature: e.target.value }; return copy })}
              disabled={!canEditFields} rows={3} className="text-sm" />
          </div>
          </div>{/* end Tech Pack fields wrapper */}
  </div>
))}
{saved && (
            <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">Changes saved.</p>
          )}
          {showActions && (
            <div className="flex items-center gap-3 pt-2">
              {canEditFields && (
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Save Changes
                </Button>
              )}
              {!data?.is_completed && (
                <Button
                  variant="outline"
                  disabled={saving || !samplingApproved}
                  className="text-green-600 border-green-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={!samplingApproved ? 'The sample must be approved before design can be marked complete' : undefined}
                  onClick={() => {
                    const missing: string[] = []
                    if (!forms[0]?.channel)  missing.push('Channel')
                    if (!forms.some(f => f.farma)) missing.push('Farma')
                    if (!forms.some(f => f.fabric)) missing.push('Fabric')
                    if (!forms.some(f => f.zipper)) missing.push('Zipper')
                    if (!designFiles.some(f => f.review_status === 'approved')) missing.push('at least 1 approved illustration')
                    if (missing.length > 0) {
                      toast.error(`Complete required fields first: ${missing.join(', ')}`)
                      return
                    }
                    setConfirmOpen(true)
                  }}
                >
                  Mark Complete
                </Button>
              )}
              {!data?.is_completed && !samplingApproved && (
                <span className="text-xs text-gray-400">Mark Complete unlocks once the sample is approved</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>}


      <ConfirmDialog
        open={confirmOpen}
        title="Mark Design Complete?"
        description="Sampling has been approved. This will advance the product directly to Merchandising and lock the design fields."
        confirmLabel="Yes, Mark Complete"
        loading={saving}
        onConfirm={() => { setConfirmOpen(false); markComplete() }}
        onCancel={() => setConfirmOpen(false)}
      />

      {lightboxIdx !== null && (
        <ImageLightbox images={lightboxImages} index={lightboxIdx} onClose={() => setLightboxIdx(null)} onNavigate={setLightboxIdx} />
      )}
    </div>
  )
}

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
import type { Product, Profile, DesignData, SalesData, ProductFile, DesignSubmission } from '@/lib/types'
import { parseTechPackAllVariants, type TechPackVariant } from '@/lib/parse-techpack'
import { ImageLightbox, type LightboxImage } from '@/components/ui/image-lightbox'

interface DesignTabProps {
  product: Product
  profile: Profile
  data: DesignData | null
  salesData: SalesData | null
  files: ProductFile[]
  submissions: DesignSubmission[]
  designers: Pick<Profile, 'id' | 'full_name'>[]
  designerWorkloads?: Record<string, number>
}

export function DesignTab({ product, profile, data, salesData, files, submissions, designers, designerWorkloads }: DesignTabProps) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const isTeamMember   = profile.role === 'design'
  const isHead         = ['admin', 'design_head'].includes(profile.role)
  const isManagement   = profile.role === 'management'
  const isRoleAllowed  = isTeamMember || isHead
  const isAssignedToMe = isTeamMember && data?.assigned_to === profile.id

  const designFiles = files.filter(f => f.department === 'design' && f.file_type?.startsWith('image/') && f.colour_tag !== 'print')
  const hasAnyApproved = designFiles.some(f => f.review_status === 'approved')
  const imageApproved  = hasAnyApproved
    && !designFiles.some(f => f.review_status === 'pending')
    && !designFiles.some(f => f.review_status === 'rejected')

  // Only the assigned designer (or head/admin) can edit — prevents designers from touching each other's work
  // canEditFields unlocks once any illustration is approved (stays unlocked even if new pending files added)
  const canEditFields  = !data?.is_locked && !data?.is_completed && (isHead || (isAssignedToMe && hasAnyApproved))
  const showActions    = !data?.is_locked && (isHead || (isAssignedToMe && hasAnyApproved))
  // canUploadIllos is open until design is marked complete — approval state does not block new uploads
  const canUploadIllos = !data?.is_locked && !data?.is_completed && (isHead || isAssignedToMe)

  const [form, setForm] = useState({
    channel:        data?.channel        || '',
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
  })

  const [category, setCategory]   = useState<ProductCategory | ''>(product.category || '')
  const [subCategory, setSubCategory] = useState<string>(product.sub_category || '')

  function handleCategoryChange(val: ProductCategory | '') {
    setCategory(val)
    if (!val) { setSubCategory(''); return }
    const subs = CATEGORY_SUBCATEGORIES[val as ProductCategory] ?? []
    setSubCategory(subs.length === 1 ? subs[0] : '')
  }
  const [brand, setBrand]         = useState<Brand | ''>(product.brand || '')
  const [newSku, setNewSku]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [saved, setSaved]         = useState(false)
  const [assignedTo, setAssignedTo] = useState<string>(data?.assigned_to || '__none__')
  const [savingAssign, setSavingAssign] = useState(false)
  const [headNotes, setHeadNotes] = useState(data?.head_notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)

  // Submission state
  const [submitting, setSubmitting]   = useState(false)
  const [submitDone, setSubmitDone]   = useState(false)
  const [approvingAll, setApprovingAll] = useState(false)

  // Per-image review state (for head)
  const [reviewingFileId, setReviewingFileId]           = useState<string | null>(null)
  const [fileRejectFeedback, setFileRejectFeedback]     = useState<Record<string, string>>({})
  const [showFileRejectBox, setShowFileRejectBox]       = useState<string | null>(null)

  // Lightbox
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const lightboxImages: LightboxImage[] = designFiles.map(f => ({
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
  const printDropRef = useRef<HTMLDivElement>(null)
  const [printUploading, setPrintUploading]     = useState(false)
  const [printProgress, setPrintProgress]       = useState<{ done: number; total: number } | null>(null)
  const [printDragging, setPrintDragging]       = useState(false)
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
  const [techPackResult, setTechPackResult] = useState<{ filled: string[] } | null>(null)
  const [techPackVariants, setTechPackVariants] = useState<TechPackVariant[]>([])
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0)

  function F({ label, field, placeholder, mono }: { label: string; field: keyof typeof form; placeholder?: string; mono?: boolean }) {
    return (
      <div className="space-y-1">
        <Label className="text-xs text-gray-500">{label}</Label>
        <Input
          placeholder={placeholder || ''}
          value={(form[field] as string) || ''}
          onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
          disabled={!canEditFields}
          className={`h-8 text-sm ${mono ? 'font-mono' : ''}`}
        />
      </div>
    )
  }

  async function handleSave() {
    setSaving(true)
    await Promise.all([
      supabase.from('design_data').update({ ...form, updated_by: profile.id }).eq('product_id', product.id),
      supabase.from('products').update({
        ...(category && { category }),
        sub_category: subCategory || null,
        ...(brand && { brand }),
        updated_by: profile.id,
      }).eq('id', product.id),
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
      ...form, is_completed: becomingComplete, updated_by: profile.id,
    }).eq('product_id', product.id)
    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: becomingComplete ? 'marked design as complete' : 'marked design as incomplete',
      department: profile.role,
    })

    if (becomingComplete && (product.workflow_stage === 'design_completed' || product.workflow_stage === 'draft')) {
      await supabase.rpc('advance_product_stage', {
        p_product_id: product.id,
        p_next_stage: 'sampling_completed',
        p_user_id: profile.id,
        p_action: 'marked design complete — stage advanced to Merchandising',
        p_department: profile.role,
      })
      fetch('/api/notify-stage-advance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id: product.id, product_name: product.name, next_stage: 'sampling_completed' }),
      }).catch(() => {})
    }

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
    const assignedDesigner = designers.find(d => d.id === userId)
    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: `assigned design to ${assignedDesigner?.full_name || 'unassigned'}`,
      department: 'design',
    })
    const previousId   = data?.assigned_to ?? null
    const previousName = previousId ? designers.find(d => d.id === previousId)?.full_name : null

    if (resolvedId && assignedDesigner) {
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
    // Email + push the designer when their illustration is approved
    if (status === 'approved') {
      fetch('/api/notify-illustration-approved', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: product.id,
          file_id:    fileId,
          file_name:  file?.name || fileId,
          feedback,
        }),
      }).catch(() => {})
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
    setApprovingAll(false)
    router.refresh()
  }

  function variantToFormUpdates(f: TechPackVariant) {
    const updates: Partial<typeof form> = {}
    const filled: string[] = []
    const map: Array<[keyof typeof form, string, string]> = [
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

  async function loadVariantIntoForm(variant: TechPackVariant) {
    const { updates, filled } = variantToFormUpdates(variant)
    setForm(prev => ({ ...prev, ...updates, sample_color: variant.colourName || prev.sample_color }))
    if (variant.styleName) {
      await supabase.from('products').update({ name: variant.styleName, updated_by: profile.id }).eq('id', product.id)
    }
    setTechPackResult({ filled })
    router.refresh()
  }

  async function handleTechPackUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    setTechPackResult(null)
    setTechPackVariants([])
    try {
      const { read, utils } = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]
      const variants = parseTechPackAllVariants(rows)

      // Email the Excel to all design heads (fire-and-forget)
      const fd = new FormData()
      fd.append('file', file)
      fd.append('product_id', product.id)
      fd.append('product_name', product.name)
      fetch('/api/notify-techpack-uploaded', { method: 'POST', body: fd }).catch(() => {})

      if (variants.length > 1) {
        // Multi-colour: let the user choose which colour to load
        setTechPackVariants(variants)
        setSelectedVariantIdx(0)
      } else {
        // Single colour: auto-load immediately (existing behaviour)
        await loadVariantIntoForm(variants[0])
      }
    } catch {
      setTechPackResult({ filled: [] })
    }
    setParsing(false)
    if (techPackRef.current) techPackRef.current.value = ''
  }

  async function handleIllustrationUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return
    setUploading(true)
    setUploadSuccess(null)
    setUploadProgress({ done: 0, total: selectedFiles.length })
    let done = 0
    for (const file of selectedFiles) {
      setUploadingName(file.name)
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', `products/${product.id}/design`)
      const res = await fetch('/api/upload-image', { method: 'POST', body: fd })
      if (res.ok) {
        const { url } = await res.json() as { url: string }
        await supabase.from('product_files').insert({
          product_id: product.id, name: file.name, file_url: url,
          file_type: file.type, file_size: file.size,
          department: 'design', uploaded_by: profile.id,
          // Head uploads go to management for approval (pending), same as designer uploads
          review_status: 'pending',
        })
      }
      done++
      setUploadProgress({ done, total: selectedFiles.length })
    }
    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: `uploaded ${selectedFiles.length} illustration(s)`, department: 'design',
    })
    // If design head uploaded, notify management for review
    if (isHead) {
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
    }
    setUploading(false)
    setUploadingName('')
    setUploadProgress(null)
    setUploadSuccess(selectedFiles.length)
    setTimeout(() => setUploadSuccess(null), 3000)
    toast.success(`${selectedFiles.length} illustration${selectedFiles.length !== 1 ? 's' : ''} uploaded`)
    if (illustrationRef.current) illustrationRef.current.value = ''
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
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
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

        {/* Tech Pack summary */}
        {data && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Design Tech Pack</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-x-6 gap-y-3 text-sm">
                {([
                  ['Designer', data.designer_name],
                  ['Farma', data.farma],
                  ['Season Year', data.season_year],
                  ['Fabric', data.fabric],
                  ['Lining', data.lining],
                  ['Air Mesh', data.air_mesh],
                  ['Zipper', data.zipper],
                  ['Puller', data.puller],
                  ['9mm Patta', data.patta_9mm],
                  ['Patta 1', data.patta_1],
                  ['Patta 2', data.patta_2],
                  ['Lader Lock', data.lader_lock],
                  ['Branding', data.branding],
                  ['Screen Print', data.screen_print],
                  ['Digital Print', data.digital_print],
                  ['Bartech', data.bartech],
                  ['Re-sampling By', data.re_sampling_by],
                ] as [string, string | null | undefined][]).filter(([, v]) => v).map(([label, value]) => (
                  <div key={label}>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
                    <p className="text-gray-800">{value}</p>
                  </div>
                ))}
              </div>
              {data.remarks && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Remarks</p>
                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{data.remarks}</p>
                </div>
              )}
              {(!data.fabric && !data.designer_name && !data.farma) && (
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

  return (
    <div className="space-y-4">

      {/* ── Design Head: Assignment + Review Queue ─────────────────── */}
      {isHead && (
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
              <CardTitle className="text-sm flex items-center gap-2 text-violet-900">
                <UserCheck className="h-4 w-4" />
                {data?.assigned_to ? 'Reassign Designer' : 'Assign Designer'}
                {savingAssign && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-4">
              {designers.length === 0 ? (
                <p className="text-xs text-violet-500">No active designers found.</p>
              ) : (
                <div className="space-y-2">
                  {data?.assigned_to && (
                    <p className="text-xs text-violet-600">
                      Currently: <strong>{designers.find(d => d.id === data.assigned_to)?.full_name || 'Unknown'}</strong>
                    </p>
                  )}
                  <div className="flex items-center gap-3">
                    <Select
                      value={assignedTo}
                      onValueChange={v => setAssignedTo(v)}
                      disabled={savingAssign}
                    >
                      <SelectTrigger className="w-56 bg-white">
                        <SelectValue placeholder="Select designer..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— Unassigned —</SelectItem>
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
                      onClick={() => saveAssignment(assignedTo)}
                      disabled={savingAssign}
                      className="bg-violet-600 hover:bg-violet-700"
                    >
                      {savingAssign ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                      {data?.assigned_to ? 'Reassign' : 'Assign'}
                    </Button>
                  </div>
                </div>
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
      {(isAssignedToMe || isHead) && <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">Illustrations</CardTitle>
            {isHead && <p className="text-xs text-amber-600 mt-0.5">Your uploads are sent to management for approval</p>}
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
          {designFiles.length === 0 ? (
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
                {designFiles.map((file, idx) => (
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
                      {canUploadIllos && file.review_status !== 'approved' && (
                        <button
                          className="h-7 w-7 rounded-full bg-white flex items-center justify-center hover:bg-red-50 pointer-events-auto"
                          onClick={e => { e.stopPropagation(); deleteFile(file) }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </button>
                      )}
                    </div>
                    {file.review_status === 'rejected' && file.review_feedback && (
                      <p className="absolute bottom-0 left-0 right-0 px-2 py-1 text-xs text-white bg-red-600/80 truncate pointer-events-none">{file.review_feedback}</p>
                    )}
                  </div>
                ))}
              </div>
              {canUploadIllos && (
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
                    <p className="text-xs text-yellow-600 mt-0.5 flex items-center gap-1"><Clock className="h-3 w-3" /> Awaiting design head review…</p>
                  )}
                  {!designFiles.some(f => f.review_status === 'pending') && designFiles.some(f => f.review_status === 'rejected') && (
                    <p className="text-xs text-red-600 mt-0.5">Some images rejected — remove them, upload revisions, then resubmit.</p>
                  )}
                  {!designFiles.some(f => f.review_status) && (
                    <p className="text-xs text-gray-500 mt-0.5">Upload your design images above, then submit for the design head&apos;s approval.</p>
                  )}
                </div>
                <Button
                  size="sm"
                  onClick={submitForReview}
                  disabled={
                    submitting ||
                    designFiles.length === 0 ||
                    designFiles.some(f => f.review_status === 'pending')
                  }
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
                  <p className="text-xs text-purple-700">Auto-fills all fields below from the design Excel</p>
                </div>
              </div>
              <Button size="sm" onClick={() => techPackRef.current?.click()} disabled={parsingTechPack} className="bg-purple-600 hover:bg-purple-700 shrink-0">
                {parsingTechPack ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {parsingTechPack ? 'Parsing…' : 'Upload Tech Pack'}
              </Button>
              <input ref={techPackRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleTechPackUpload} />
            </div>
            {/* Multi-colour variant selector */}
            {techPackVariants.length > 1 && (
              <div className="mt-3 pt-3 border-t border-purple-200 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-purple-800">
                    {techPackVariants.length} colour variants found — select one to load
                  </p>
                </div>
                {/* Colour pills */}
                <div className="flex flex-wrap gap-2">
                  {techPackVariants.map((v, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedVariantIdx(i)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                        i === selectedVariantIdx
                          ? 'bg-purple-600 text-white border-purple-600'
                          : 'bg-white text-purple-700 border-purple-300 hover:border-purple-500'
                      }`}
                    >
                      {v.colourName || `Colour ${i + 1}`}
                    </button>
                  ))}
                </div>
                {/* Selected variant preview */}
                {(() => {
                  const v = techPackVariants[selectedVariantIdx]
                  const rows: [string, string][] = [
                    ['Fabric',        v.fabric],
                    ['Lining',        v.lining],
                    ['Air Mesh',      v.airMesh],
                    ['Zipper',        v.zipper],
                    ['Puller',        v.puller],
                    ['9mm Patta',     v.patta9mm],
                    ['Patta 1',       v.patta1],
                    ['Patta 2',       v.patta2],
                    ['Lader Lock',    v.laderLock],
                    ['Branding',      v.branding],
                    ['Screen Print',  v.screenPrint],
                    ['Digital Print', v.digitalPrint],
                    ['Bartech',       v.bartech],
                    ['Remarks',       v.remarks],
                  ].filter(([, val]) => val) as [string, string][]
                  return rows.length > 0 ? (
                    <div className="bg-white rounded-lg border border-purple-100 px-3 py-2.5">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                        {rows.map(([label, val]) => (
                          <div key={label}>
                            <p className="text-[10px] font-semibold text-purple-300 uppercase tracking-wide">{label}</p>
                            <p className="text-xs text-gray-800 truncate">{val}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null
                })()}
                <Button
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 h-7 text-xs"
                  onClick={() => loadVariantIntoForm(techPackVariants[selectedVariantIdx])}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  Load {techPackVariants[selectedVariantIdx]?.colourName || `Colour ${selectedVariantIdx + 1}`} into form
                </Button>
              </div>
            )}
            {/* Single colour result */}
            {techPackResult && techPackVariants.length <= 1 && (
              <div className="mt-3 pt-3 border-t border-purple-200">
                {techPackResult.filled.length > 0 ? (
                  <div className="flex items-start gap-2 text-purple-800">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-purple-600" />
                    <p className="text-xs">Filled: {techPackResult.filled.join(', ')}. Review and save.</p>
                  </div>
                ) : (
                  <p className="text-xs text-red-600">Could not extract data — check the file format.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Print Files Upload (drag & drop) ── */}
      {(isAssignedToMe || isHead) && canEditFields && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Print Files</CardTitle>
              <p className="text-xs text-gray-400 mt-0.5">Images and PDFs — drag &amp; drop or click to browse</p>
            </div>
            {printUploading && printProgress && (
              <span className="text-xs text-blue-600 flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {printProgress.done}/{printProgress.total} uploading…
              </span>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Drop zone */}
            <div
              ref={printDropRef}
              onClick={() => !printUploading && printFileRef.current?.click()}
              onDragEnter={e => { e.preventDefault(); e.stopPropagation(); setPrintDragging(true) }}
              onDragLeave={e => { e.preventDefault(); e.stopPropagation(); setPrintDragging(false) }}
              onDragOver={e  => { e.preventDefault(); e.stopPropagation() }}
              onDrop={e => {
                e.preventDefault(); e.stopPropagation(); setPrintDragging(false)
                if (!printUploading) handlePrintUpload(Array.from(e.dataTransfer.files))
              }}
              className={`border-2 border-dashed rounded-xl py-8 text-center cursor-pointer transition-colors ${
                printDragging
                  ? 'border-blue-400 bg-blue-50'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
              }`}
            >
              <Upload className={`h-7 w-7 mx-auto mb-2 ${printDragging ? 'text-blue-400' : 'text-gray-300'}`} />
              <p className="text-sm font-medium text-gray-600">
                {printDragging ? 'Drop files here' : 'Drag & drop files here, or click to browse'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Images (JPG, PNG, WebP) and PDFs — up to 20 MB each</p>
            </div>
            <input
              ref={printFileRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={e => handlePrintUpload(Array.from(e.target.files || []))}
            />

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

      {/* ── Design Details form ──────────────────────────────────── */}
      {(isAssignedToMe || isHead) && <Card>
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
                <Select value={form.channel} onValueChange={(v) => setForm(f => ({ ...f, channel: v }))} disabled={!canEditFields}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select channel" /></SelectTrigger>
                  <SelectContent>
                    {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Tech Pack fields */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Tech Pack</p>
            <div className="grid grid-cols-3 gap-3 mb-3">
              {F({ label: "Designer Name", field: "designer_name" })}
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Style Name</Label>
                <Input value={product.name} disabled className="h-8 text-sm bg-gray-50 text-gray-500" />
              </div>
              {F({ label: "Farma", field: "farma", placeholder: "e.g. DAYSTEP", mono: true })}
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {F({ label: "Season Year", field: "season_year", placeholder: "e.g. 2026-2027" })}
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Sample Color</Label>
                <Input placeholder="e.g. Midnight Black" value={form.sample_color}
                  onChange={e => setForm(f => ({ ...f, sample_color: e.target.value }))}
                  disabled={!canEditFields} className="h-8 text-sm" />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {F({ label: "Fabric", field: "fabric", placeholder: "e.g. 600*600 PU-BLK" })}
            {F({ label: "Lining", field: "lining", placeholder: "e.g. PLN LGR" })}
            {F({ label: "Air Mesh", field: "air_mesh", placeholder: "YES / NO / NA" })}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {F({ label: "Zipper", field: "zipper", placeholder: "e.g. 8 NO.-BLK" })}
            {F({ label: "Puller", field: "puller", placeholder: "e.g. PVC PRIO NEW-BLK" })}
            {F({ label: "9mm Patta", field: "patta_9mm", placeholder: "e.g. BLK+HANGER" })}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {F({ label: "Patta 1", field: "patta_1", placeholder: 'e.g. 0.75"-BLK' })}
            {F({ label: "Patta 2", field: "patta_2", placeholder: "e.g. NA" })}
            {F({ label: "Lader Lock", field: "lader_lock", placeholder: 'e.g. 0.75"-BLK' })}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {F({ label: "Branding", field: "branding", placeholder: "e.g. PBR PRIO HOPE-BLK-RED" })}
            {F({ label: "Screen Print", field: "screen_print", placeholder: "YES / NO / NA" })}
            {F({ label: "Digital Print", field: "digital_print", placeholder: "YES / NO / NA" })}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {F({ label: "Bartech", field: "bartech", placeholder: "e.g. BLK" })}
            {F({ label: "Re-sampling By", field: "re_sampling_by" })}
            <div className="space-y-1">
              <Label className="text-xs text-gray-500">Remarks</Label>
              <Textarea placeholder="e.g. USE 600×600 PVC FABRIC IN BACK" value={form.remarks}
                onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                disabled={!canEditFields} rows={2} className="text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {F({ label: "Add On 1", field: "add_on_1" })}
            {F({ label: "Add On 2", field: "add_on_2" })}
            {F({ label: "Add On 3", field: "add_on_3" })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {F({ label: "Designer Sign", field: "designer_sign" })}
          </div>

          {/* Colour SKUs */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Colour SKUs</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              {form.color_skus.map((sku, i) => (
                <span key={i} className="flex items-center gap-1 bg-gray-100 text-gray-700 text-xs px-2.5 py-1 rounded-full font-mono">
                  {sku}
                  {canEditFields && (
                    <button onClick={() => setForm(f => ({ ...f, color_skus: f.color_skus.filter((_, j) => j !== i) }))}>
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
                      setForm(f => ({ ...f, color_skus: [...f.color_skus, newSku.trim()] }))
                      setNewSku('')
                    }
                  }}
                  className="font-mono h-8 text-sm"
                />
                <Button type="button" variant="outline" size="icon" className="h-8 w-8"
                  onClick={() => { if (newSku.trim()) { setForm(f => ({ ...f, color_skus: [...f.color_skus, newSku.trim()] })); setNewSku('') } }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          {/* Unique Feature / USP */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-500">Unique Feature / USP</Label>
            <Textarea placeholder="Unique selling point or feature…"
              value={form.unique_feature}
              onChange={e => setForm(f => ({ ...f, unique_feature: e.target.value }))}
              disabled={!canEditFields} rows={3} className="text-sm" />
          </div>

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
                <Button variant="outline" onClick={() => setConfirmOpen(true)} disabled={saving} className="text-green-600 border-green-200">
                  Mark Complete
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>}
      <ConfirmDialog
        open={confirmOpen}
        title="Mark Design Complete?"
        description="This will advance the product to the Sampling stage and notify the sampling team. Design fields will be locked."
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

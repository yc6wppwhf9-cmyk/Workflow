'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Loader2, Lock, Save, Plus, X, Upload, ExternalLink, Trash2,
  FileSpreadsheet, CheckCircle2, UserCheck, Clock, XCircle, Send,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { CATEGORY_LABELS, BRANDS, CHANNELS, type ProductCategory, type Brand } from '@/lib/types'
import type { Product, Profile, DesignData, SalesData, ProductFile, DesignSubmission } from '@/lib/types'
import { parseTechPackRows } from '@/lib/parse-techpack'

interface DesignTabProps {
  product: Product
  profile: Profile
  data: DesignData | null
  salesData: SalesData | null
  files: ProductFile[]
  submissions: DesignSubmission[]
  designers: Pick<Profile, 'id' | 'full_name'>[]
}

export function DesignTab({ product, profile, data, salesData, files, submissions, designers }: DesignTabProps) {
  const router = useRouter()

  const isTeamMember = profile.role === 'design'
  const isHead       = ['admin', 'design_head'].includes(profile.role)
  const isRoleAllowed = isTeamMember || isHead

  const latestSubmission = submissions[0] ?? null
  const designFiles = files.filter(f => f.department === 'design' && f.file_type?.startsWith('image/'))
  const imageApproved = designFiles.some(f => f.review_status === 'approved') && !designFiles.some(f => f.review_status === 'pending')

  // Team members can edit form fields only after images are approved
  // Head / admin always have full edit access
  const canEditFields  = !data?.is_locked && !data?.is_completed && isRoleAllowed && (isHead || imageApproved)
  const showActions    = !data?.is_locked && isRoleAllowed && (isHead || imageApproved)
  const canUploadIllos = !data?.is_locked && !data?.is_completed && isRoleAllowed && (isHead || !imageApproved)

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
  const [brand, setBrand]         = useState<Brand | ''>(product.brand || '')
  const [newSku, setNewSku]       = useState('')
  const [saving, setSaving]       = useState(false)
  const [saved, setSaved]         = useState(false)
  const [assignedTo, setAssignedTo] = useState<string>(data?.assigned_to || '__none__')
  const [savingAssign, setSavingAssign] = useState(false)
  const [headNotes, setHeadNotes] = useState(data?.head_notes || '')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)

  // Submission state
  const [submitting, setSubmitting]   = useState(false)
  const [submitDone, setSubmitDone]   = useState(false)
  // Per-image review state (for head)
  const [reviewingFileId, setReviewingFileId]           = useState<string | null>(null)
  const [fileRejectFeedback, setFileRejectFeedback]     = useState<Record<string, string>>({})
  const [showFileRejectBox, setShowFileRejectBox]       = useState<string | null>(null)

  const illustrationRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading]       = useState(false)
  const [uploadingName, setUploadingName] = useState('')

  const techPackRef = useRef<HTMLInputElement>(null)
  const [parsingTechPack, setParsing]   = useState(false)
  const [techPackResult, setTechPackResult] = useState<{ filled: string[] } | null>(null)

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
    const supabase = createClient()
    await Promise.all([
      supabase.from('design_data').update({ ...form, updated_by: profile.id }).eq('product_id', product.id),
      supabase.from('products').update({
        ...(category && { category }),
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
    setTimeout(() => { setSaved(false); router.refresh() }, 2000)
  }

  async function markComplete() {
    const becomingComplete = !data?.is_completed
    setSaving(true)
    const supabase = createClient()
    await supabase.from('design_data').update({
      ...form, is_completed: becomingComplete, updated_by: profile.id,
    }).eq('product_id', product.id)
    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: becomingComplete ? 'marked design as complete' : 'marked design as incomplete',
      department: 'design',
    })

    if (becomingComplete && product.workflow_stage === 'design_completed') {
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
    const supabase = createClient()
    const resolvedId = userId === '__none__' ? null : userId
    const { error } = await supabase.from('design_data').update({ assigned_to: resolvedId, updated_by: profile.id }).eq('product_id', product.id)
    if (error) {
      console.error('saveAssignment error:', error)
      setSavingAssign(false)
      return
    }
    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: `assigned design to ${designers.find(d => d.id === userId)?.full_name || 'unassigned'}`,
      department: 'design',
    })
    setSavingAssign(false)
    router.refresh()
  }

  async function saveHeadNotes() {
    setSavingNotes(true)
    const supabase = createClient()
    await supabase.from('design_data').update({ head_notes: headNotes || null, updated_by: profile.id }).eq('product_id', product.id)
    setSavingNotes(false)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  async function submitForReview() {
    setSubmitting(true)
    const res = await fetch('/api/design-submissions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ product_id: product.id }),
    })
    if (res.ok) { setSubmitDone(true); setTimeout(() => setSubmitDone(false), 3000) }
    setSubmitting(false)
    router.refresh()
  }

  async function reviewImage(fileId: string, status: 'approved' | 'rejected', feedback?: string) {
    setReviewingFileId(fileId)
    const supabase = createClient()
    await supabase.from('product_files').update({
      review_status: status,
      review_feedback: feedback || null,
      reviewed_by: profile.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', fileId)
    setReviewingFileId(null)
    setShowFileRejectBox(null)
    setFileRejectFeedback(prev => { const next = { ...prev }; delete next[fileId]; return next })
    router.refresh()
  }

  async function handleTechPackUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setParsing(true)
    setTechPackResult(null)
    try {
      const { read, utils } = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]
      const f = parseTechPackRows(rows)
      const filled: string[] = []
      const updates: Partial<typeof form> = {}
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
      setForm(prev => ({ ...prev, ...updates }))
      if (f.styleName && (product.name === 'New Product' || product.name.startsWith('PROD-'))) {
        const supabase = createClient()
        await supabase.from('products').update({ name: f.styleName, updated_by: profile.id }).eq('id', product.id)
        filled.push(`Product name → ${f.styleName}`)
      }
      setTechPackResult({ filled })
    } catch {
      setTechPackResult({ filled: [] })
    }
    setParsing(false)
    if (techPackRef.current) techPackRef.current.value = ''
    router.refresh()
  }

  async function handleIllustrationUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return
    setUploading(true)
    const supabase = createClient()
    const ts = Date.now()
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i]
      setUploadingName(file.name)
      const storagePath = `${product.id}/design_${ts}_${i}_${file.name}`
      const { error } = await supabase.storage.from('product-files').upload(storagePath, file, { upsert: true })
      if (!error) {
        await supabase.from('product_files').insert({
          product_id: product.id, name: file.name, file_url: storagePath,
          file_type: file.type, file_size: file.size,
          department: 'design', uploaded_by: profile.id,
        })
      }
    }
    await supabase.from('activity_logs').insert({
      product_id: product.id, user_id: profile.id,
      action: `uploaded ${selectedFiles.length} illustration(s)`, department: 'design',
    })
    setUploading(false)
    setUploadingName('')
    if (illustrationRef.current) illustrationRef.current.value = ''
    router.refresh()
  }

  async function deleteFile(file: ProductFile) {
    const supabase = createClient()
    const url = file.file_url
    const parts = url.split('/product-files/')
    const storagePath = parts.length > 1 ? decodeURIComponent(parts[1].split('?')[0]) : null
    if (storagePath) await supabase.storage.from('product-files').remove([storagePath])
    await supabase.from('product_files').delete().eq('id', file.id)
    router.refresh()
  }

  // Submission status pill
  function SubmissionStatusBadge({ s }: { s: DesignSubmission }) {
    if (s.status === 'approved') return (
      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
        <CheckCircle2 className="h-3 w-3" /> Approved
      </span>
    )
    if (s.status === 'rejected') return (
      <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
        <XCircle className="h-3 w-3" /> Rejected
      </span>
    )
    return (
      <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
        <Clock className="h-3 w-3" /> Awaiting review
      </span>
    )
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
              <div className="grid grid-cols-3 gap-2">
                {designFiles.map(file => (
                  <a key={file.id} href={file.file_url} target="_blank" rel="noopener noreferrer"
                    className="group relative aspect-video rounded-lg overflow-hidden border border-gray-200 bg-gray-50 hover:border-blue-300 transition-colors"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={file.file_url} alt={file.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <ExternalLink className="h-5 w-5 text-white" />
                    </div>
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
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
                Assign Designer
                {savingAssign && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-4">
              {designers.length === 0 ? (
                <p className="text-xs text-violet-500">No active designers found.</p>
              ) : (
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
                      {designers.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => saveAssignment(assignedTo)}
                    disabled={savingAssign}
                    className="bg-violet-600 hover:bg-violet-700"
                  >
                    {savingAssign ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
                    Assign
                  </Button>
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

          {/* Image Review Queue — per image */}
          <Card className="border-violet-200">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm text-violet-900">Design Submissions for Review</CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-3">
              {designFiles.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">No illustrations uploaded yet — designer will upload and submit.</p>
              ) : designFiles.map(file => (
                <div key={file.id} className={`border rounded-lg overflow-hidden ${
                  file.review_status === 'approved' ? 'border-green-200 bg-green-50' :
                  file.review_status === 'rejected' ? 'border-red-200 bg-red-50' :
                  file.review_status === 'pending'  ? 'border-yellow-200 bg-yellow-50' :
                  'border-gray-200'
                }`}>
                  <div className="flex items-start gap-3 p-3">
                    <a href={file.file_url} target="_blank" rel="noopener noreferrer"
                      className="relative shrink-0 w-20 h-20 rounded-md overflow-hidden border border-gray-200 bg-gray-50 hover:opacity-90 transition-opacity"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={file.file_url} alt={file.name} className="w-full h-full object-cover" />
                    </a>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <p className="text-sm font-medium text-gray-800 truncate">{file.name}</p>
                        {file.review_status === 'approved' && (
                          <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                            <CheckCircle2 className="h-3 w-3" /> Approved
                          </span>
                        )}
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
                        {!file.review_status && (
                          <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-medium shrink-0">
                            Not submitted
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
              {submissions.length > 0 && designFiles.length > 0 && !designFiles.some(f => f.review_status) && (
                <p className="text-xs text-gray-400 pt-1">Images uploaded but not yet submitted for review by the designer.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ── Head Remarks visible to designers ─────────────────────── */}
      {isTeamMember && data?.head_notes && (
        <Card className="border-violet-200 bg-violet-50">
          <CardContent className="pt-4 pb-4">
            <p className="text-xs font-semibold text-violet-400 uppercase tracking-wide mb-1">Remarks from Design Head</p>
            <p className="text-sm text-violet-900 whitespace-pre-wrap">{data.head_notes}</p>
          </CardContent>
        </Card>
      )}

      {/* ── Illustrations (team members only — head sees submissions in review queue) ── */}
      {isTeamMember && <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Illustrations</CardTitle>
          {canUploadIllos && (
            <Button size="sm" variant="outline" onClick={() => illustrationRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? uploadingName || 'Uploading…' : 'Upload'}
            </Button>
          )}
          <input ref={illustrationRef} type="file" accept="image/*" multiple className="hidden" onChange={handleIllustrationUpload} />
        </CardHeader>
        <CardContent>
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
              <div className="grid grid-cols-3 gap-2">
                {designFiles.map(file => (
                  <div key={file.id} className={`relative group rounded-lg overflow-hidden aspect-video bg-gray-50 border-2 ${
                    file.review_status === 'approved' ? 'border-green-400' :
                    file.review_status === 'rejected' ? 'border-red-400' :
                    file.review_status === 'pending'  ? 'border-yellow-400' :
                    'border-gray-200'
                  }`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={file.file_url} alt={file.name} className="w-full h-full object-cover" />
                    {/* Status badge */}
                    {file.review_status && (
                      <div className={`absolute top-1.5 left-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs font-medium ${
                        file.review_status === 'approved' ? 'bg-green-500 text-white' :
                        file.review_status === 'rejected' ? 'bg-red-500 text-white' :
                        'bg-yellow-500 text-white'
                      }`}>
                        {file.review_status === 'approved' ? <CheckCircle2 className="h-3 w-3" /> :
                         file.review_status === 'rejected' ? <XCircle className="h-3 w-3" /> :
                         <Clock className="h-3 w-3" />}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <a href={file.file_url} target="_blank" rel="noopener noreferrer"
                        className="h-7 w-7 rounded-full bg-white flex items-center justify-center hover:bg-gray-100"
                        onClick={e => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3.5 w-3.5 text-gray-700" />
                      </a>
                      {canUploadIllos && file.review_status !== 'approved' && (
                        <button className="h-7 w-7 rounded-full bg-white flex items-center justify-center hover:bg-red-50" onClick={() => deleteFile(file)}>
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </button>
                      )}
                    </div>
                    {file.review_status === 'rejected' && file.review_feedback && (
                      <p className="absolute bottom-0 left-0 right-0 px-2 py-1 text-xs text-white bg-red-600/80 truncate">{file.review_feedback}</p>
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
      {isTeamMember && !data?.is_locked && !data?.is_completed && (
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

      {/* ── Tech Pack Upload (team members only) ── */}
      {isTeamMember && canEditFields && (
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
            {techPackResult && (
              <div className="mt-3 pt-3 border-t border-purple-200">
                {techPackResult.filled.length > 0 ? (
                  <div className="flex items-start gap-2 text-purple-800">
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-purple-600" />
                    <div className="text-xs space-y-1">
                      <p>Filled: {techPackResult.filled.join(', ')}. Review and save.</p>
                      <p className="text-purple-600">If the Excel has multiple colour variants, data is taken from the first variant.</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-red-600">Could not extract data — check the file format.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Locked notice for team member before image approval */}
      {isTeamMember && !imageApproved && !data?.is_locked && !data?.is_completed && (
        <p className="text-xs text-gray-400 text-center py-1">
          Tech pack and design form unlock after design head approves your illustrations.
        </p>
      )}

      {/* ── Design Details form (team members only) ──────────────── */}
      {isTeamMember && <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base">Design Details</CardTitle>
          {data?.is_locked && (
            <span className="flex items-center gap-1.5 text-xs text-orange-600 bg-orange-50 px-2.5 py-1 rounded-full border border-orange-200">
              <Lock className="h-3 w-3" /> Stage Locked
            </span>
          )}
        </CardHeader>
        <CardContent className="space-y-5">

          {/* Product identity */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Product</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Category</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as ProductCategory)} disabled={!canEditFields}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(CATEGORY_LABELS) as [ProductCategory, string][]).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
                <Button variant="outline" onClick={markComplete} disabled={saving} className="text-green-600 border-green-200">
                  Mark Complete
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>}
    </div>
  )
}

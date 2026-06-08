'use client'

import { useState, useRef } from 'react'
import { toast } from 'sonner'
import {
  Plus, Upload, Send, FileText, Loader2,
  X, ChevronDown, ChevronUp, CheckCircle2,
  Printer, Scissors,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Profile } from '@/lib/types'

type DevFile = {
  id: string
  name: string
  file_url: string
  file_type: string | null
  file_size: number | null
  category: string | null
  created_at: string
}

type Development = {
  id: string
  title: string
  remarks: string | null
  status: string
  sent_at: string | null
  created_at: string
  creator: { id: string; full_name: string } | null
  files: DevFile[]
}

interface Props {
  profile: Profile
  initialDevelopments: Development[]
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

function fmtSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function NewDevelopmentClient({ profile, initialDevelopments }: Props) {
  const [developments, setDevelopments] = useState<Development[]>(initialDevelopments)

  // Form state
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle]     = useState('')
  const [newRemarks, setNewRemarks] = useState('')
  const [printFiles, setPrintFiles] = useState<File[]>([])
  const [trimFiles, setTrimFiles]   = useState<File[]>([])
  const [sending, setSending]       = useState(false)
  const printFileRef                = useRef<HTMLInputElement>(null)
  const trimFileRef                 = useRef<HTMLInputElement>(null)

  // Card expand
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const isHead = ['design_head', 'admin'].includes(profile.role)

  // ── File helpers ─────────────────────────────────────────────────────────

  async function uploadFilesToDev(devId: string, files: File[], category: string): Promise<DevFile[]> {
    const saved: DevFile[] = []
    for (const file of files) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', `new-development/${devId}`)
      const uploadRes = await fetch('/api/upload-file', { method: 'POST', body: fd })
      if (!uploadRes.ok) { toast.error(`Failed to upload ${file.name}`); continue }
      const { url } = await uploadRes.json()
      const saveRes = await fetch(`/api/new-development/${devId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, file_url: url, file_type: file.type, file_size: file.size, category }),
      })
      if (saveRes.ok) {
        const { file: newFile } = await saveRes.json()
        saved.push(newFile)
      }
    }
    return saved
  }

  function handlePickPrint(e: React.ChangeEvent<HTMLInputElement>) {
    setPrintFiles(prev => [...prev, ...Array.from(e.target.files || [])])
    e.target.value = ''
  }

  function handlePickTrim(e: React.ChangeEvent<HTMLInputElement>) {
    setTrimFiles(prev => [...prev, ...Array.from(e.target.files || [])])
    e.target.value = ''
  }

  function resetForm() {
    setNewTitle('')
    setNewRemarks('')
    setPrintFiles([])
    setTrimFiles([])
    setShowCreate(false)
  }

  // ── Send (create + upload + notify in one step) ──────────────────────────

  async function handleSend() {
    if (!newTitle.trim()) { toast.error('Title is required'); return }
    if (printFiles.length === 0 && trimFiles.length === 0) {
      toast.error('Attach at least one Print or Trim file')
      return
    }
    setSending(true)

    // 1. Create record
    const createRes = await fetch('/api/new-development', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle.trim(), remarks: newRemarks.trim() || null }),
    })
    if (!createRes.ok) { toast.error('Failed to create'); setSending(false); return }
    const { development } = await createRes.json()

    // 2. Upload print + trim files separately
    const uploadedPrint = await uploadFilesToDev(development.id, printFiles, 'print')
    const uploadedTrim  = await uploadFilesToDev(development.id, trimFiles,  'trim')
    const allUploaded   = [...uploadedPrint, ...uploadedTrim]

    // 3. Send to merchandising head
    const sendRes = await fetch(`/api/new-development/${development.id}/send`, { method: 'POST' })
    if (!sendRes.ok) { toast.error('Created but failed to notify merchandising team') }

    setDevelopments(prev => [{
      ...development,
      status: 'sent',
      sent_at: new Date().toISOString(),
      files: allUploaded,
      creator: { id: profile.id, full_name: profile.full_name },
    }, ...prev])
    resetForm()
    setExpandedId(development.id)
    toast.success('Sent to merchandising team')
    setSending(false)
  }

  // ── File list section (reused for print + trim) ───────────────────────────

  function FileSection({
    label,
    icon: Icon,
    color,
    files,
    onRemove,
    onAdd,
    inputRef,
    onPick,
  }: {
    label: string
    icon: React.ElementType
    color: string
    files: File[]
    onRemove: (idx: number) => void
    onAdd: () => void
    inputRef: React.RefObject<HTMLInputElement | null>
    onPick: (e: React.ChangeEvent<HTMLInputElement>) => void
  }) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 ${color}`} />
          <Label className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{label}</Label>
        </div>

        {files.length > 0 && (
          <div className="space-y-1.5">
            {files.map((f, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-blue-100">
                <FileText className="h-4 w-4 text-red-400 shrink-0" />
                <span className="flex-1 text-xs text-gray-700 truncate font-medium">{f.name}</span>
                <span className="text-xs text-gray-400 shrink-0">{fmtSize(f.size)}</span>
                <button
                  onClick={() => onRemove(idx)}
                  className="text-gray-300 hover:text-red-500 transition-colors ml-1"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onAdd}
          className="flex items-center gap-2 w-full border-2 border-dashed border-blue-200 hover:border-blue-400 bg-white hover:bg-blue-50 rounded-lg px-4 py-2.5 text-sm text-blue-600 font-medium transition-colors"
        >
          <Upload className="h-4 w-4" />
          {files.length > 0 ? `Add more ${label} files…` : `Click to upload ${label} files`}
        </button>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept="application/pdf,image/*"
          multiple
          onChange={onPick}
        />
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 max-w-3xl">

      {/* Top bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {developments.length} development{developments.length !== 1 ? 's' : ''} sent
        </p>
        <Button onClick={() => setShowCreate(v => !v)}>
          <Plus className="h-4 w-4" /> New Development
        </Button>
      </div>

      {/* ── Create + Send form ───────────────────────────────────────────── */}
      {showCreate && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-5 space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-blue-700 font-semibold uppercase tracking-wide">Title *</Label>
              <Input
                placeholder="e.g. Summer 2026 — New Backpack Design"
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="bg-white"
                autoFocus
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-blue-700 font-semibold uppercase tracking-wide">Remarks</Label>
              <Textarea
                placeholder="Add notes or context for the merchandising team…"
                value={newRemarks}
                onChange={e => setNewRemarks(e.target.value)}
                rows={3}
                className="bg-white text-sm"
              />
            </div>

            {/* Print upload */}
            <FileSection
              label="Print"
              icon={Printer}
              color="text-violet-600"
              files={printFiles}
              onRemove={idx => setPrintFiles(prev => prev.filter((_, i) => i !== idx))}
              onAdd={() => printFileRef.current?.click()}
              inputRef={printFileRef}
              onPick={handlePickPrint}
            />

            {/* Trim upload */}
            <FileSection
              label="Trim"
              icon={Scissors}
              color="text-teal-600"
              files={trimFiles}
              onRemove={idx => setTrimFiles(prev => prev.filter((_, i) => i !== idx))}
              onAdd={() => trimFileRef.current?.click()}
              inputRef={trimFileRef}
              onPick={handlePickTrim}
            />

            <p className="text-xs text-blue-500">* At least one Print or Trim file is required.</p>

            <div className="flex gap-2 pt-1">
              <Button
                onClick={handleSend}
                disabled={sending}
                className="bg-green-600 hover:bg-green-700"
              >
                {sending
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                  : <><Send className="h-4 w-4" /> Send to Merchandising</>}
              </Button>
              <Button
                variant="ghost"
                onClick={resetForm}
                disabled={sending}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {developments.length === 0 && !showCreate && (
        <div className="py-16 text-center border-2 border-dashed border-gray-200 rounded-xl">
          <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 font-medium">Nothing sent yet</p>
          <p className="text-xs text-gray-400 mt-1">
            Create a new development, attach Print and Trim files, and send to the merchandising team.
          </p>
        </div>
      )}

      {/* ── Sent cards (read-only) ────────────────────────────────────── */}
      {developments.map(dev => {
        const isExpanded = expandedId === dev.id
        const creator    = Array.isArray(dev.creator) ? dev.creator[0] : dev.creator
        const printDevFiles = dev.files.filter(f => f.category === 'print')
        const trimDevFiles  = dev.files.filter(f => f.category === 'trim')
        const otherDevFiles = dev.files.filter(f => !f.category || (f.category !== 'print' && f.category !== 'trim'))

        return (
          <Card key={dev.id} className="border-green-200">
            <CardHeader className="pb-2 pt-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-sm font-semibold text-gray-900">{dev.title}</CardTitle>
                    <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                      <CheckCircle2 className="h-3 w-3" /> Sent
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {isHead && creator ? `${creator.full_name} · ` : ''}
                    {dev.sent_at ? fmtDate(dev.sent_at) : fmtDate(dev.created_at)}
                    {' · '}{printDevFiles.length > 0 && `${printDevFiles.length} print`}
                    {printDevFiles.length > 0 && trimDevFiles.length > 0 && ', '}
                    {trimDevFiles.length > 0 && `${trimDevFiles.length} trim`}
                    {otherDevFiles.length > 0 && ` + ${otherDevFiles.length} other`}
                    {' file'}{dev.files.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <button
                  className="h-7 w-7 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded shrink-0"
                  onClick={() => setExpandedId(isExpanded ? null : dev.id)}
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pb-4 pt-0 space-y-3">
                {dev.remarks && (
                  <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Remarks</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{dev.remarks}</p>
                  </div>
                )}

                {/* Print files */}
                {printDevFiles.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Printer className="h-3.5 w-3.5 text-violet-500" />
                      <p className="text-xs font-semibold text-violet-600 uppercase tracking-wide">Print Files</p>
                    </div>
                    <div className="space-y-1.5">
                      {printDevFiles.map(f => (
                        <FileRow key={f.id} f={f} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Trim files */}
                {trimDevFiles.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Scissors className="h-3.5 w-3.5 text-teal-500" />
                      <p className="text-xs font-semibold text-teal-600 uppercase tracking-wide">Trim Files</p>
                    </div>
                    <div className="space-y-1.5">
                      {trimDevFiles.map(f => (
                        <FileRow key={f.id} f={f} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Other/legacy files */}
                {otherDevFiles.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Files</p>
                    <div className="space-y-1.5">
                      {otherDevFiles.map(f => (
                        <FileRow key={f.id} f={f} />
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}

function FileRow({ f }: { f: DevFile }) {
  return (
    <div className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
      <FileText className="h-4 w-4 text-red-400 shrink-0" />
      <a
        href={f.file_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 text-xs text-blue-600 hover:underline truncate font-medium"
      >
        {f.name}
      </a>
      {f.file_size && (
        <span className="text-xs text-gray-400 shrink-0">{fmtSize(f.file_size)}</span>
      )}
    </div>
  )
}

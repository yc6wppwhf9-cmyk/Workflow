'use client'

import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, Download, FileSpreadsheet, Loader2, Trash2, Upload } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export interface AdditionWorkItem {
  id: string
  name: string
  file_url: string
  file_type: string | null
  file_size: number | null
  remarks: string | null
  inv_codes: string | null
  inv_note: string | null
  inv_updated_at: string | null
  created_at: string
}

const EXCEL_RE = /\.(xlsx|xls|csv)$/i

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}
function fmtSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AdditionWorkClient({
  canUpload, canRespond, initialItems,
}: { canUpload: boolean; canRespond: boolean; initialItems: AdditionWorkItem[] }) {
  const [items, setItems] = useState<AdditionWorkItem[]>(initialItems)
  const [remarks, setRemarks] = useState('')
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []).filter(
      f => EXCEL_RE.test(f.name)
        || f.type === 'application/vnd.ms-excel'
        || f.type.includes('spreadsheet')
        || f.type === 'text/csv',
    )
    if (fileRef.current) fileRef.current.value = ''
    if (picked.length === 0) {
      toast.error('Please select Excel files (.xlsx, .xls, .csv)')
      return
    }

    setUploading({ done: 0, total: picked.length })
    const added: AdditionWorkItem[] = []
    let done = 0
    for (const file of picked) {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'addition-work')
      const up = await fetch('/api/upload-file', { method: 'POST', body: fd })
      if (!up.ok) { toast.error(`Failed to upload ${file.name}`); done++; setUploading({ done, total: picked.length }); continue }
      const { url } = await up.json()
      const res = await fetch('/api/addition-work', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, file_url: url, file_type: file.type, file_size: file.size, remarks: remarks.trim() || null }),
      })
      if (res.ok) {
        const { item } = await res.json()
        added.push(item)
      } else {
        toast.error(`Failed to save ${file.name}`)
      }
      done++
      setUploading({ done, total: picked.length })
    }

    setItems(prev => [...added, ...prev])
    setUploading(null)
    setRemarks('')
    if (added.length) toast.success(`${added.length} sheet${added.length !== 1 ? 's' : ''} shared with the BOM team`)
  }

  async function remove(id: string) {
    setDeletingId(id)
    const res = await fetch(`/api/addition-work/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setItems(prev => prev.filter(s => s.id !== id))
    } else {
      toast.error('Failed to delete')
    }
    setDeletingId(null)
  }

  function patchItem(id: string, patch: Partial<AdditionWorkItem>) {
    setItems(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s))
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {canUpload && (
        <Card className="border-blue-200 bg-blue-50">
          <CardContent className="pt-5 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-blue-700 font-semibold uppercase tracking-wide">Remarks (optional)</Label>
              <Input
                placeholder="Note for the BOM team…"
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                className="bg-white"
              />
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={!!uploading}
              className="flex items-center gap-2 w-full border-2 border-dashed border-blue-200 hover:border-blue-400 bg-white hover:bg-blue-50 rounded-lg px-4 py-3 text-sm text-blue-600 font-medium transition-colors disabled:opacity-60"
            >
              {uploading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading {uploading.done}/{uploading.total}…</>
                : <><Upload className="h-4 w-4" /> Upload Excel sheets</>}
            </button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              className="hidden"
              onChange={handleUpload}
            />
            <p className="text-xs text-blue-500">Only you and the BOM team can see these files.</p>
          </CardContent>
        </Card>
      )}

      {items.length === 0 ? (
        <div className="py-16 text-center border-2 border-dashed border-gray-200 rounded-xl">
          <FileSpreadsheet className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 font-medium">No addition work yet</p>
          <p className="text-xs text-gray-400 mt-1">
            {canUpload ? 'Upload an Excel sheet to share it with the BOM team.' : 'Sheets uploaded by the merchandising head will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(s => (
            <Card key={s.id} className="border-gray-200">
              <CardContent className="py-3 space-y-3">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-green-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{s.name}</p>
                    <p className="text-xs text-gray-400">
                      {fmtDate(s.created_at)}{s.file_size ? ` · ${fmtSize(s.file_size)}` : ''}
                      {s.remarks ? ` · ${s.remarks}` : ''}
                    </p>
                  </div>
                  <a
                    href={s.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded border border-blue-200 bg-white shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </a>
                  {canUpload && (
                    <button
                      onClick={() => remove(s.id)}
                      disabled={deletingId === s.id}
                      className="h-7 w-7 flex items-center justify-center rounded border border-red-200 bg-white text-red-500 hover:bg-red-50 shrink-0"
                    >
                      {deletingId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>

                {/* INV response — BOM edits, merch head sees read-only */}
                {canRespond
                  ? <InvEditor item={s} onSaved={patch => patchItem(s.id, patch)} />
                  : (s.inv_codes || s.inv_note) && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide mb-0.5">Updated INV from BOM</p>
                      {s.inv_codes && <p className="text-sm font-mono text-emerald-900">{s.inv_codes}</p>}
                      {s.inv_note && <p className="text-xs text-emerald-700 mt-0.5 whitespace-pre-wrap">{s.inv_note}</p>}
                    </div>
                  )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function InvEditor({ item, onSaved }: { item: AdditionWorkItem; onSaved: (patch: Partial<AdditionWorkItem>) => void }) {
  const [codes, setCodes] = useState(item.inv_codes || '')
  const [note, setNote] = useState(item.inv_note || '')
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  async function save() {
    setSaving(true)
    const res = await fetch(`/api/addition-work/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inv_codes: codes, inv_note: note }),
    })
    setSaving(false)
    if (res.ok) {
      onSaved({ inv_codes: codes.trim() || null, inv_note: note.trim() || null, inv_updated_at: new Date().toISOString() })
      setSavedFlash(true)
      toast.success('Updated INV sent to merchandising head')
      setTimeout(() => setSavedFlash(false), 2000)
    } else {
      toast.error('Failed to save INV')
    }
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2.5 space-y-2">
      <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">Updated INV (BOM)</p>
      <Input
        placeholder="Updated INV code(s)…"
        value={codes}
        onChange={e => setCodes(e.target.value)}
        className="h-8 text-sm font-mono bg-white"
      />
      <Textarea
        placeholder="Note (optional)…"
        value={note}
        onChange={e => setNote(e.target.value)}
        rows={2}
        className="text-sm bg-white"
      />
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving} className="h-7 bg-emerald-600 hover:bg-emerald-700">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save INV
        </Button>
        {savedFlash && <span className="text-xs text-emerald-600">Saved</span>}
        {item.inv_updated_at && !savedFlash && (
          <span className="text-xs text-gray-400">Updated {fmtDate(item.inv_updated_at)}</span>
        )}
      </div>
    </div>
  )
}

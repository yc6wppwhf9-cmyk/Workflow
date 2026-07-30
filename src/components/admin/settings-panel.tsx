'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Loader2, Shield, Workflow, Building2, RefreshCw, FileSpreadsheet, Upload, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { STAGE_LABELS, STAGE_OWNER_ROLE, ROLE_LABELS, WORKFLOW_STAGES } from '@/lib/types'
import type { Profile, WorkflowStage } from '@/lib/types'

interface SettingsPanelProps {
  users: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'>[]
  currentProfile: Profile
  settings: Record<string, string>
}


export function SettingsPanel({ users, currentProfile, settings }: SettingsPanelProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')

  const itemMasterRef = useRef<HTMLInputElement>(null)
  const [imCount, setImCount] = useState<number | null>(null)
  const [imUploading, setImUploading] = useState(false)
  const [imProgress, setImProgress] = useState('')
  const [imResult, setImResult] = useState<{ count?: number; dupeCodes?: number; removed?: number; error?: string } | null>(null)
  // Default to a true replace — the button says "Replace Item Master", and a
  // master that accumulates every past upload is how stale names survive.
  // Untick to merge instead, when the file is a partial ERP export.
  const [imPrune, setImPrune] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ products?: number; renamed?: number; error?: string } | null>(null)

  useEffect(() => {
    fetch('/api/upload-item-master').then(r => r.json()).then(j => setImCount(j.count ?? null))
  }, [])

  // Company settings — loaded from DB
  const [companyName, setCompanyName] = useState(settings.company_name ?? 'HSCVPL')
  const [companyTagline, setCompanyTagline] = useState(settings.company_tagline ?? 'Product Lifecycle Management')
  const [savingCompany, setSavingCompany] = useState(false)
  const [savedCompany, setSavedCompany] = useState(false)

  async function saveCompanySettings() {
    setSavingCompany(true)
    const supabase = createClient()
    await Promise.all([
      supabase.from('system_settings').update({ value: companyName, updated_at: new Date().toISOString() }).eq('key', 'company_name'),
      supabase.from('system_settings').update({ value: companyTagline, updated_at: new Date().toISOString() }).eq('key', 'company_tagline'),
    ])
    setSavedCompany(true)
    setTimeout(() => { setSavedCompany(false); router.refresh() }, 2000)
    setSavingCompany(false)
  }

  // My account
  const [fullName, setFullName] = useState(currentProfile.full_name)
  const [savingAccount, setSavingAccount] = useState(false)
  const [savedAccount, setSavedAccount] = useState(false)

  async function saveAccount() {
    setSavingAccount(true)
    const supabase = createClient()
    await supabase.from('profiles').update({ full_name: fullName }).eq('id', currentProfile.id)
    setSavedAccount(true)
    setTimeout(() => setSavedAccount(false), 2000)
    setSavingAccount(false)
    router.refresh()
  }

  async function handleItemMasterUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImUploading(true)
    setImProgress('Parsing file...')
    setImResult(null)

    try {
      // Parse entirely in the browser — no server round-trip for the raw file
      const { read, utils } = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][]

      // Scan for header row — match any known column name variant
      const invCodeVariants = ['ARTICLE CODE', 'INV CODE', 'ITEM CODE', 'ARTICLE NO', 'CODE']
      const itemNameVariants = ['ITEM NAME', 'ITEM DESCRIPTION', 'DESCRIPTION', 'NAME', 'ITEM DESC']
      const uomVariants = ['UOM', 'UNIT', 'UNIT OF MEASURE', 'BASE UOM']

      const matchesHeader = (cell: string, variants: string[]) =>
        variants.some(v => String(cell).trim().toUpperCase() === v)

      let headerRowIdx = -1
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].some(c => matchesHeader(String(c), invCodeVariants))) { headerRowIdx = i; break }
      }
      if (headerRowIdx < 0) {
        setImResult({ error: `Header row not found. Expected a column named one of: ${invCodeVariants.join(', ')}` })
        setImUploading(false); return
      }

      const headers = rows[headerRowIdx]
      const articleCodeIdx = headers.findIndex(h => matchesHeader(String(h), invCodeVariants))
      const itemNameIdx = headers.findIndex(h => matchesHeader(String(h), itemNameVariants))
      const uomIdx = headers.findIndex(h => matchesHeader(String(h), uomVariants))

      if (itemNameIdx < 0) {
        setImResult({ error: `Item Name column not found. Expected one of: ${itemNameVariants.join(', ')}` })
        setImUploading(false); return
      }

      const rawItems = rows
        .slice(headerRowIdx + 1)
        .map(r => ({
          inv_code: String(r[articleCodeIdx] ?? '').trim(),
          item_name: String(r[itemNameIdx] ?? '').trim(),
          item_name_norm: String(r[itemNameIdx] ?? '').trim().toLowerCase().replace(/\s+/g, ' '),
          uom: uomIdx >= 0 ? String(r[uomIdx] ?? '').trim() : '',
        }))
        .filter(r => r.inv_code && r.item_name_norm)

      // Deduplicate by inv_code — that is the row identity, and a batch cannot
      // carry the same key twice. Items that share a NAME are kept: they are
      // distinct components with distinct codes.
      const itemMap = new Map(rawItems.map(r => [r.inv_code, r]))
      const items = Array.from(itemMap.values())
      const dupeCodes = rawItems.length - items.length

      // One id tags every batch of this import. Only when pruning is asked for
      // does the last batch delete rows the import did not write — an ERP export
      // is often a partial report, and silently dropping codes it omits would
      // break BOMs that still reference them.
      // Replacing deletes every code the file omits, so say how many that is
      // before doing it — the count is only knowable once the file is parsed.
      if (imPrune && imCount && imCount > items.length) {
        const willDelete = imCount - items.length
        const ok = window.confirm(
          `This file has ${items.length.toLocaleString()} items, but the master currently holds ` +
          `${imCount.toLocaleString()}.\n\nReplacing will delete roughly ${willDelete.toLocaleString()} ` +
          `INV code(s) that are not in this file. Existing BOM lines keep their saved names, but those ` +
          `codes will no longer be found on future imports.\n\nContinue?`
        )
        if (!ok) { setImUploading(false); setImProgress(''); if (itemMasterRef.current) itemMasterRef.current.value = ''; return }
      }

      const importBatch = crypto.randomUUID()
      const BATCH = 1000
      let removed = 0

      for (let i = 0; i < items.length; i += BATCH) {
        const isLast = i + BATCH >= items.length
        setImProgress(`Saving... ${Math.min(i + BATCH, items.length).toLocaleString()} / ${items.length.toLocaleString()}`)
        const res = await fetch('/api/upload-item-master', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: items.slice(i, i + BATCH),
            import_batch: importBatch,
            prune: isLast && imPrune,
          }),
        })
        const json = await res.json()
        if (!res.ok) { setImResult({ error: json.error ?? 'Upload failed' }); setImUploading(false); return }
        if (isLast) removed = json.removed ?? 0
      }

      setImResult({ count: items.length, dupeCodes, removed })
      // Merging keeps codes the file omits, so re-read the real total.
      fetch('/api/upload-item-master').then(r => r.json()).then(j => setImCount(j.count ?? items.length))
    } catch (err) {
      setImResult({ error: String(err) })
    }

    setImProgress('')
    setImUploading(false)
    if (itemMasterRef.current) itemMasterRef.current.value = ''
  }

  // Re-point existing BOM lines at the master. Needed after a master upload:
  // names were copied in at import time, so corrected codes stay stale until
  // this runs.
  async function resyncItemNames() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/resync-item-names', { method: 'POST' })
      const json = await res.json()
      setSyncResult(res.ok ? { products: json.products, renamed: json.renamed } : { error: json.error ?? 'Re-sync failed' })
    } catch (err) {
      setSyncResult({ error: String(err) })
    }
    setSyncing(false)
  }

  async function resetUserPassword(userId: string, email: string) {
    const supabase = createClient()
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    alert(`Password reset email sent to ${email}`)
  }

  return (
    <div className="max-w-3xl space-y-6">

      {/* Company */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-gray-500" />
            <CardTitle className="text-base">Company</CardTitle>
          </div>
          <CardDescription>Displayed in the sidebar and reports</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Company Name</Label>
              <Input value={companyName} onChange={e => setCompanyName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Tagline</Label>
              <Input value={companyTagline} onChange={e => setCompanyTagline(e.target.value)} />
            </div>
          </div>
          <Button onClick={saveCompanySettings} disabled={savingCompany} size="sm">
            {savingCompany ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savedCompany ? 'Saved!' : 'Save Company Settings'}
          </Button>
        </CardContent>
      </Card>

      {/* My Account */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-gray-500" />
            <CardTitle className="text-base">My Account</CardTitle>
          </div>
          <CardDescription>{currentProfile.email}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Display Name</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} />
          </div>
          <Button onClick={saveAccount} disabled={savingAccount} size="sm">
            {savingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {savedAccount ? 'Saved!' : 'Save Name'}
          </Button>
        </CardContent>
      </Card>

      {/* Workflow Stage Owners */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-gray-500" />
            <CardTitle className="text-base">Workflow Stage Owners</CardTitle>
          </div>
          <CardDescription>Which role is responsible for each stage</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {WORKFLOW_STAGES.map(stage => (
              <div key={stage} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium">{STAGE_LABELS[stage]}</p>
                  <p className="text-xs text-gray-400 capitalize">Owned by: {ROLE_LABELS[STAGE_OWNER_ROLE[stage] ?? 'viewer']}</p>
                </div>
                <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full capitalize">
                  {ROLE_LABELS[STAGE_OWNER_ROLE[stage] ?? 'viewer']}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">Stage ownership is built into the workflow and cannot be changed here.</p>
        </CardContent>
      </Card>

      {/* Item Master */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-gray-500" />
            <CardTitle className="text-base">Item Master</CardTitle>
          </div>
          <CardDescription>
            INV codes lookup table used when importing merchandising Excel.
            {imCount !== null && <span className="ml-1 text-green-600 font-medium">{imCount.toLocaleString()} items loaded.</span>}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => itemMasterRef.current?.click()} disabled={imUploading}>
              {imUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {imUploading ? 'Loading...' : imCount ? 'Replace Item Master' : 'Upload Item Master'}
            </Button>
            <input ref={itemMasterRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleItemMasterUpload} />
            {imUploading && imProgress && <p className="text-xs text-blue-600 font-medium">{imProgress}</p>}
            {!imUploading && imResult && (
              imResult.error
                ? <p className="text-xs text-red-600">{imResult.error}</p>
                : <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3.5 w-3.5" />{imResult.count?.toLocaleString()} items loaded</span>
            )}
          </div>
          {!imUploading && imResult && !imResult.error && (
            <p className="text-xs text-gray-500 mt-2">
              {(imResult.removed ?? 0) > 0 && <>{imResult.removed?.toLocaleString()} item(s) not in the file were removed. </>}
              {(imResult.dupeCodes ?? 0) > 0 && <>{imResult.dupeCodes?.toLocaleString()} row(s) repeated an INV code and were skipped.</>}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-2">Upload the <span className="font-mono">New_Item_Master_report.xlsx</span> file. Items are keyed on INV code, so a renamed item updates in place instead of creating a second row.</p>

          <label className="flex items-start gap-2 mt-3 cursor-pointer">
            <input
              type="checkbox"
              checked={imPrune}
              onChange={e => setImPrune(e.target.checked)}
              disabled={imUploading}
              className="mt-0.5"
            />
            <span className="text-xs text-gray-500">
              <span className="font-medium text-gray-700">Remove items not in this file</span>
              <span className="block text-gray-400">
                On: the master ends up exactly matching the file — old codes it omits are deleted. Untick
                only when the file is a partial export, in which case existing items are kept and the upload
                just adds and updates.
              </span>
            </span>
          </label>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-3 flex-wrap">
              <Button size="sm" variant="outline" onClick={resyncItemNames} disabled={syncing}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {syncing ? 'Re-syncing...' : 'Fix Existing BOM Names'}
              </Button>
              {!syncing && syncResult && (
                syncResult.error
                  ? <p className="text-xs text-red-600">{syncResult.error}</p>
                  : <span className="flex items-center gap-1 text-xs text-green-600">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {syncResult.renamed?.toLocaleString()} line(s) corrected across {syncResult.products?.toLocaleString()} product(s)
                    </span>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Rewrites item names and units on already-imported BOMs from the current master, and clears mismatch flags that the corrected master resolves. Run this after replacing the master.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Team Password Reset */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-gray-500" />
            <CardTitle className="text-base">Team Password Reset</CardTitle>
          </div>
          <CardDescription>Send a password reset email to any team member</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {users.filter(u => u.id !== currentProfile.id).map(u => (
              <div key={u.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div>
                  <p className="text-sm font-medium">{u.full_name}</p>
                  <p className="text-xs text-gray-400">{u.email} · <span className="capitalize">{ROLE_LABELS[u.role] ?? u.role}</span></p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => resetUserPassword(u.id, u.email)}
                >
                  Reset Password
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  )
}

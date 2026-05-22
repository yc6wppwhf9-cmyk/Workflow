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
import { STAGE_LABELS, STAGE_OWNER_ROLE, ROLE_LABELS } from '@/lib/types'
import type { Profile, WorkflowStage } from '@/lib/types'

interface SettingsPanelProps {
  users: Pick<Profile, 'id' | 'full_name' | 'email' | 'role'>[]
  currentProfile: Profile
}

const WORKFLOW_STAGES: WorkflowStage[] = [
  'draft',
  'design_completed',
  'merchandising_completed',
  'bom_finalized',
  'marketing_ready',
  'sales_priced',
  'product_live',
]

export function SettingsPanel({ users, currentProfile }: SettingsPanelProps) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState('')

  const itemMasterRef = useRef<HTMLInputElement>(null)
  const [imCount, setImCount] = useState<number | null>(null)
  const [imUploading, setImUploading] = useState(false)
  const [imProgress, setImProgress] = useState('')
  const [imResult, setImResult] = useState<{ count?: number; error?: string } | null>(null)

  useEffect(() => {
    fetch('/api/upload-item-master').then(r => r.json()).then(j => setImCount(j.count ?? null))
  }, [])

  // Company settings
  const [companyName, setCompanyName] = useState('HSCVPL')
  const [companyTagline, setCompanyTagline] = useState('Product Lifecycle Management')

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

      // Header row has 'ARTICLE CODE' (row 2 in this file, but scan to be safe)
      let headerRowIdx = -1
      for (let i = 0; i < rows.length; i++) {
        if (rows[i].some(c => String(c).trim() === 'ARTICLE CODE')) { headerRowIdx = i; break }
      }
      if (headerRowIdx < 0) { setImResult({ error: 'ARTICLE CODE column not found' }); setImUploading(false); return }

      const headers = rows[headerRowIdx]
      const articleCodeIdx = headers.findIndex(h => String(h).trim() === 'ARTICLE CODE')
      const itemNameIdx = headers.findIndex(h => String(h).trim() === 'ITEM NAME')
      const uomIdx = headers.findIndex(h => String(h).trim() === 'UOM')

      const rawItems = rows
        .slice(headerRowIdx + 1)
        .map(r => ({
          inv_code: String(r[articleCodeIdx] ?? '').trim(),
          item_name: String(r[itemNameIdx] ?? '').trim(),
          item_name_norm: String(r[itemNameIdx] ?? '').trim().toLowerCase().replace(/\s+/g, ' '),
          uom: uomIdx >= 0 ? String(r[uomIdx] ?? '').trim() : '',
        }))
        .filter(r => r.inv_code && r.item_name_norm)

      // Deduplicate by item_name_norm — upsert fails if same key appears twice in one batch
      const itemMap = new Map(rawItems.map(r => [r.item_name_norm, r]))
      const items = Array.from(itemMap.values())

      setImProgress(`Saving ${items.length.toLocaleString()} items...`)

      // Write directly to Supabase from the browser (no server API hop)
      const supabase = createClient()
      const BATCH = 1000
      for (let i = 0; i < items.length; i += BATCH) {
        const { error } = await supabase
          .from('item_master')
          .upsert(items.slice(i, i + BATCH), { onConflict: 'item_name_norm' })
        if (error) { setImResult({ error: error.message }); setImUploading(false); return }
        setImProgress(`Saving... ${Math.min(i + BATCH, items.length).toLocaleString()} / ${items.length.toLocaleString()}`)
      }

      setImResult({ count: items.length })
      setImCount(items.length)
    } catch (err) {
      setImResult({ error: String(err) })
    }

    setImProgress('')
    setImUploading(false)
    if (itemMasterRef.current) itemMasterRef.current.value = ''
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
          <p className="text-xs text-gray-400">Note: Company name changes take effect after the next deployment.</p>
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
            {WORKFLOW_STAGES.filter(s => s !== 'draft').map(stage => (
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
          <p className="text-xs text-gray-400 mt-2">Upload the <span className="font-mono">New_Item_Master_report.xlsx</span> file. INV codes are matched to BOM item names automatically on next merch Excel upload.</p>
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

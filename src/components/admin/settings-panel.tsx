'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Save, Loader2, Shield, Workflow, Building2, RefreshCw } from 'lucide-react'
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
                  <p className="text-xs text-gray-400 capitalize">Owned by: {ROLE_LABELS[STAGE_OWNER_ROLE[stage]]}</p>
                </div>
                <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full capitalize">
                  {ROLE_LABELS[STAGE_OWNER_ROLE[stage]]}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">Stage ownership is built into the workflow and cannot be changed here.</p>
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

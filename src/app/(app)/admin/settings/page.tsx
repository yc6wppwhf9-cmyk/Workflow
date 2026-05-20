import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { SettingsPanel } from '@/components/admin/settings-panel'

export default async function AdminSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .eq('is_active', true)
    .order('full_name')

  return (
    <div>
      <Header
        title="Settings"
        subtitle="Configure workflow, roles, and system preferences"
      />
      <div className="p-6">
        <SettingsPanel users={users ?? []} currentProfile={profile} />
      </div>
    </div>
  )
}

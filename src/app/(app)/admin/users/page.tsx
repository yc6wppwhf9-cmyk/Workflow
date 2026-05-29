import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { UsersTable } from '@/components/admin/users-table'
import { NewUserButton } from '@/components/admin/new-user-button'
import { SeedUsersButton } from '@/components/admin/seed-users-button'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: unlockRequests } = await supabase
    .from('stage_unlock_requests')
    .select('*, requester:profiles!requested_by(full_name, email), product:products(name, sku)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return (
    <div>
      <Header
        title="User Management"
        subtitle="Manage team members and their roles"
        actions={<div className="flex gap-2"><SeedUsersButton /><NewUserButton /></div>}
      />
      <div className="p-6">
        <UsersTable users={users || []} unlockRequests={unlockRequests || []} adminId={user!.id} />
      </div>
    </div>
  )
}

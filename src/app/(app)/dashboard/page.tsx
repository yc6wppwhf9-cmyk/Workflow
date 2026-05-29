import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/supabase/server'
import { SalesDashboard }      from './_sales-dashboard'
import { DesignDashboard }     from './_design-dashboard'
import { DesignHeadDashboard } from './_design-head-dashboard'
import { DepartmentDashboard } from './_department-dashboard'
import { AdminDashboard }      from './_admin-dashboard'

const DEPT_ROLES = new Set(['sampling', 'merchandising', 'merchandising_head', 'bom', 'marketing'])

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; page?: string }>
}) {
  const { f: filter, page: pageParam } = await searchParams
  const page    = Math.max(1, parseInt(pageParam || '1', 10))
  const profile = await getCurrentProfile()

  if (!profile) redirect('/login')

  const role = profile.role

  if (role === 'sales')       return <SalesDashboard      profile={profile} filter={filter} />
  if (role === 'design')      return <DesignDashboard     profile={profile} filter={filter} />
  if (role === 'design_head') return <DesignHeadDashboard profile={profile} filter={filter} />
  if (DEPT_ROLES.has(role))   return <DepartmentDashboard profile={profile} filter={filter} />

  // admin, management, viewer — full pipeline view
  return <AdminDashboard profile={profile} filter={filter} page={page} />
}

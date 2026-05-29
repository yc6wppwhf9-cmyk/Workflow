import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, CheckCircle2, ArrowRight, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { one, formatDateTime, formatShortDate, daysSince, daysUntil, isOverdue } from '@/lib/utils'
import { type WorkflowStage, type UserRole } from '@/lib/types'
import type { Profile } from '@/lib/types'
import { KpiCard } from './_shared'

const DEPT_CONFIG: Record<string, { stage: WorkflowStage; dataTable: string; label: string; tab: string; color: string }> = {
  sampling:           { stage: 'sampling_completed',      dataTable: 'sampling_data',      label: 'Sampling',      tab: 'sampling',      color: 'bg-cyan-50 [&>svg]:text-cyan-600' },
  merchandising:      { stage: 'merchandising_completed', dataTable: 'merchandising_data', label: 'Merchandising', tab: 'merchandising', color: 'bg-blue-50 [&>svg]:text-blue-600' },
  merchandising_head: { stage: 'merchandising_completed', dataTable: 'merchandising_data', label: 'Merchandising', tab: 'merchandising', color: 'bg-teal-50 [&>svg]:text-teal-600' },
  bom:                { stage: 'bom_finalized',           dataTable: 'bom_data',           label: 'BOM',           tab: 'bom',           color: 'bg-orange-50 [&>svg]:text-orange-600' },
  marketing:          { stage: 'marketing_ready',         dataTable: 'marketing_data',     label: 'Marketing',     tab: 'marketing',     color: 'bg-yellow-50 [&>svg]:text-yellow-600' },
}

export async function DepartmentDashboard({ profile, filter }: { profile: Profile; filter?: string }) {
  const show = (key: string) => !filter || filter === key
  const cfg  = DEPT_CONFIG[profile.role as UserRole]
  if (!cfg) return null

  const supabase = await createClient()
  const [{ data: myWorkProducts }, { data: recentLogs }] = await Promise.all([
    supabase.from('products')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select(`id, name, workflow_stage, created_at, dept_data:${cfg.dataTable}(is_completed, updated_at), sales_data(deadline_date)` as any)
      .eq('workflow_stage', cfg.stage)
      .order('created_at', { ascending: false }),
    supabase.from('activity_logs')
      .select('*, user:profiles(full_name), product:products(name)')
      .eq('department', profile.role)
      .order('created_at', { ascending: false })
      .limit(6),
  ])

  type DeptProduct = {
    id: string; name: string; workflow_stage: string; created_at: string
    dept_data: { is_completed: boolean; updated_at: string }[] | null
    sales_data: { deadline_date: string | null }[] | null
  }
  const rawProducts = myWorkProducts as unknown as DeptProduct[] | null
  const products = (rawProducts || []).map(p => ({
    ...p,
    dept:     one(p.dept_data)     as { is_completed: boolean } | null,
    deadline: (one(p.sales_data)   as { deadline_date: string | null } | null)?.deadline_date ?? null,
  }))
  const pending   = products.filter(p => !p.dept?.is_completed)
  const completed = products.filter(p =>  p.dept?.is_completed)

  return (
    <div>
      <Header title={`${cfg.label} Dashboard`} subtitle={`Welcome, ${profile.full_name.split(' ')[0]}`} />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <KpiCard label="Waiting for Me"   value={pending.length}   sub="ready to work on" icon={AlertCircle}  color="bg-amber-50 [&>svg]:text-amber-500" href="?f=pending"   active={filter === 'pending'} />
          <KpiCard label="Completed"         value={completed.length} icon={CheckCircle2}    color="bg-green-50 [&>svg]:text-green-600"                      href="?f=completed" active={filter === 'completed'} />
          <KpiCard label="Total in My Stage" value={products.length}  icon={Package}         color={cfg.color}                                               href="?f=all"       active={filter === 'all'} />
        </div>

        {show('pending') && pending.length > 0 && (
          <Card className="border-amber-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-amber-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" /> Products Waiting for {cfg.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Deadline</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Arrived</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pending.map(p => (
                    <tr key={p.id} className={`hover:bg-amber-50 ${isOverdue(p.deadline) ? 'bg-red-50' : ''}`}>
                      <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-xs">
                        {(() => {
                          const d = daysUntil(p.deadline)
                          if (d === null) return <span className="text-gray-300">—</span>
                          if (d < 0)  return <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-semibold">⚠ {Math.abs(d)}d overdue</span>
                          if (d === 0) return <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-semibold">Due today</span>
                          if (d <= 3)  return <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-full">{d}d left</span>
                          return <span className="text-gray-500">{formatShortDate(p.deadline!)} <span className="text-gray-400">({d}d)</span></span>
                        })()}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">{daysSince(p.created_at) === 0 ? 'Today' : `${daysSince(p.created_at)}d ago`}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/products/${p.id}?tab=${cfg.tab}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">
                          Open <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {show('completed') && completed.length > 0 && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" />Recently Completed</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                  <th className="px-4 py-2"></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {completed.slice(0, 5).map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/products/${p.id}?tab=${cfg.tab}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">
                          View <ArrowRight className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Recent Department Activity</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(recentLogs || []).map(log => {
              const user    = one(log.user)    as { full_name?: string } | null
              const product = one(log.product) as { name?: string } | null
              return (
                <div key={log.id} className="flex items-start gap-3">
                  <div className="h-2 w-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
                  <div>
                    <p className="text-sm text-gray-900"><span className="font-medium">{user?.full_name || 'Team'}</span> {log.action}{product?.name && <span className="text-gray-500"> · {product.name}</span>}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(log.created_at)}</p>
                  </div>
                </div>
              )
            })}
            {(recentLogs || []).length === 0 && <p className="text-sm text-gray-400 text-center py-2">No activity yet.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

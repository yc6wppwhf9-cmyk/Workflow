import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, CheckCircle2, ArrowRight, AlertCircle, Clipboard, Layers } from 'lucide-react'
import Link from 'next/link'
import { one, formatDateTime, formatShortDate, daysSince, daysUntil, isOverdue } from '@/lib/utils'
import { type WorkflowStage, type UserRole } from '@/lib/types'
import type { Profile } from '@/lib/types'
import { KpiCard } from './_shared'

const DEPT_CONFIG: Record<string, { stage: WorkflowStage; dataTable: string; label: string; tab: string; color: string }> = {
  sampling:           { stage: 'sampling_completed',      dataTable: 'sampling_data',      label: 'Sampling',      tab: 'sampling',      color: 'bg-cyan-50 [&>svg]:text-cyan-600' },
  merchandising:      { stage: 'merchandising_completed', dataTable: 'merchandising_data', label: 'Merchandising', tab: 'merchandising', color: 'bg-blue-50 [&>svg]:text-blue-600' },
  merchandising_head: { stage: 'sampling_completed',      dataTable: 'merchandising_data', label: 'Merchandising', tab: 'merchandising', color: 'bg-teal-50 [&>svg]:text-teal-600' },
  bom:                { stage: 'bom_finalized',           dataTable: 'bom_data',           label: 'BOM',           tab: 'bom',           color: 'bg-orange-50 [&>svg]:text-orange-600' },
  marketing:          { stage: 'marketing_ready',         dataTable: 'marketing_data',     label: 'Marketing',     tab: 'marketing',     color: 'bg-yellow-50 [&>svg]:text-yellow-600' },
}

export async function DepartmentDashboard({ profile, filter }: { profile: Profile; filter?: string }) {
  const show = (key: string) => !filter || filter === key
  const cfg  = DEPT_CONFIG[profile.role as UserRole]
  if (!cfg) return null

  const supabase = await createClient()
  const isMerchTeamMember = profile.role === 'merchandising'
  const isSamplingRole    = profile.role === 'sampling'
  // merchandising_head logs are recorded under 'merchandising' department in the tab
  const logDepts = profile.role === 'merchandising_head'
    ? ['merchandising', 'merchandising_head']
    : [profile.role]

  const [
    { data: myWorkProducts },
    { data: recentLogs },
    { data: myAssignment },
    { data: earlyDesignProducts },
    { data: earlyApprovedFileRows },
  ] = await Promise.all([
    supabase.from('products')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select(`id, name, workflow_stage, created_at, dept_data:${cfg.dataTable}(is_completed, updated_at), sales_data(deadline_date), design_data(color_skus)` as any)
      .eq('workflow_stage', cfg.stage)
      .order('created_at', { ascending: false }),
    supabase.from('activity_logs')
      .select('*, user:profiles(full_name), product:products(name)')
      .in('department', logDepts)
      .order('created_at', { ascending: false })
      .limit(6),
    // Merchandising team members: their assigned products
    isMerchTeamMember
      ? supabase.from('merchandising_data')
          .select('product_id, is_completed, attribute_sheet_handed_over, product:products(id, name, workflow_stage, sales_data(deadline_date))')
          .eq('assigned_to', profile.id)
          .limit(10)
      : Promise.resolve({ data: null }),
    // Sampling early queue: products still in design but with approved illustrations
    isSamplingRole
      ? supabase.from('products')
          .select('id, name, workflow_stage, sales_data(deadline_date)')
          .eq('workflow_stage', 'design_completed')
      : Promise.resolve({ data: null }),
    // Approved design illustration file IDs (to match against early products)
    isSamplingRole
      ? supabase.from('product_files')
          .select('product_id')
          .eq('department', 'design')
          .eq('review_status', 'approved')
          .is('colour_tag', null)
      : Promise.resolve({ data: null }),
  ])

  type DeptProduct = {
    id: string; name: string; workflow_stage: string; created_at: string
    dept_data: { is_completed: boolean; updated_at: string }[] | null
    sales_data: { deadline_date: string | null }[] | null
    design_data: { color_skus: string[] | null }[] | null
  }
  const rawProducts = myWorkProducts as unknown as DeptProduct[] | null
  const products = (rawProducts || []).map(p => {
    const skus = (one(p.design_data) as { color_skus: string[] | null } | null)?.color_skus
    return {
      ...p,
      dept:        one(p.dept_data)   as { is_completed: boolean } | null,
      deadline:    (one(p.sales_data) as { deadline_date: string | null } | null)?.deadline_date ?? null,
      // Each colour variant is one unit of sampling work; default 1 if no SKUs recorded
      designCount: Math.max(1, Array.isArray(skus) ? skus.length : 0),
    }
  })
  const pending   = products.filter(p => !p.dept?.is_completed)
  const completed = products.filter(p =>  p.dept?.is_completed)
  // Sampling work is counted per design (colour variant), not per product
  const sumDesigns = (list: typeof products) => list.reduce((n, p) => n + p.designCount, 0)
  const pendingDesigns   = sumDesigns(pending)
  const completedDesigns = sumDesigns(completed)
  const totalDesigns     = sumDesigns(products)

  type AssignmentRow = {
    product_id: string
    is_completed: boolean
    attribute_sheet_handed_over: boolean
    product: { id: string; name: string; workflow_stage: string; sales_data: { deadline_date: string | null }[] | null }[] | null
  }
  // Early sampling: products in design stage that have at least one approved illustration
  const earlyApprovedProductIds = new Set((earlyApprovedFileRows || []).map(f => f.product_id))
  type EarlyProduct = { id: string; name: string; workflow_stage: string; sales_data: { deadline_date: string | null }[] | null }
  const earlyForSampling = ((earlyDesignProducts || []) as unknown as EarlyProduct[])
    .filter(p => earlyApprovedProductIds.has(p.id))

  const assignments = (myAssignment as unknown as AssignmentRow[] | null) || []
  const activeAssignments = assignments.map(a => {
    const prod = one(a.product) as { id: string; name: string; sales_data: { deadline_date: string | null }[] | null } | null
    const deadline = prod?.sales_data ? (one(prod.sales_data) as { deadline_date?: string | null } | null)?.deadline_date ?? null : null
    return { ...a, prod, deadline }
  })

  const myPendingCount = activeAssignments.filter(a => !a.attribute_sheet_handed_over).length

  return (
    <div>
      <Header title={`${cfg.label} Dashboard`} subtitle={`Welcome, ${profile.full_name.split(' ')[0]}`} />
      <div className="p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {isMerchTeamMember ? (
            <>
              <KpiCard label="My Tasks"    value={activeAssignments.length} sub="assigned to me"    icon={Clipboard}   color="bg-violet-50 [&>svg]:text-violet-600" href="?f=mine"      active={filter === 'mine'} />
              <KpiCard label="Pending"      value={myPendingCount}           sub="sheet not handed over" icon={AlertCircle} color="bg-amber-50 [&>svg]:text-amber-500"  href="?f=pending"   active={filter === 'pending'} />
              <KpiCard label="Total Stage"  value={products.length}          sub="products at this stage" icon={Package}    color={cfg.color}                           href="?f=all"       active={filter === 'all'} />
            </>
          ) : isSamplingRole ? (
            <>
              {/* Sampling output is measured in designs (colour variants), not products */}
              <KpiCard label="Designs to Sample" value={pendingDesigns}   sub={`${pending.length} product${pending.length !== 1 ? 's' : ''} waiting`}  icon={AlertCircle}  color="bg-amber-50 [&>svg]:text-amber-500" href="?f=pending"   active={filter === 'pending'} />
              <KpiCard label="Designs Done"      value={completedDesigns} sub={`${completed.length} product${completed.length !== 1 ? 's' : ''}`}      icon={CheckCircle2} color="bg-green-50 [&>svg]:text-green-600" href="?f=completed" active={filter === 'completed'} />
              <KpiCard label="Total Designs"     value={totalDesigns}     sub={`${products.length} product${products.length !== 1 ? 's' : ''} at stage`} icon={Package}      color={cfg.color}                          href="?f=all"       active={filter === 'all'} />
              {earlyForSampling.length > 0 && (
                <KpiCard label="Early Sampling Ready" value={earlyForSampling.length} sub="illustrations approved" icon={Layers} color="bg-purple-50 [&>svg]:text-purple-600" href="?f=early" active={filter === 'early'} />
              )}
            </>
          ) : (
            <>
              <KpiCard label="Waiting for Me"   value={pending.length}   sub="ready to work on" icon={AlertCircle}  color="bg-amber-50 [&>svg]:text-amber-500" href="?f=pending"   active={filter === 'pending'} />
              <KpiCard label="Completed"         value={completed.length} icon={CheckCircle2}    color="bg-green-50 [&>svg]:text-green-600"                      href="?f=completed" active={filter === 'completed'} />
              <KpiCard label="Total in My Stage" value={products.length}  icon={Package}         color={cfg.color}                                               href="?f=all"       active={filter === 'all'} />
            </>
          )}
        </div>

        {/* Merchandising team member — My assigned tasks */}
        {isMerchTeamMember && show('mine') && (
          <Card className="border-violet-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-violet-700 flex items-center gap-2">
                <Clipboard className="h-4 w-4" /> My Assigned Tasks
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {activeAssignments.length === 0 ? (
                <p className="text-sm text-gray-400 px-6 py-8 text-center">No products assigned to you yet. Check with your head.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Deadline</th>
                    <th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Sheet Status</th>
                    <th className="px-4 py-2"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {activeAssignments.map(a => (
                      <tr key={a.product_id} className={`hover:bg-violet-50 ${isOverdue(a.deadline) ? 'bg-red-50' : ''}`}>
                        <td className="px-6 py-3 font-medium text-gray-900">{a.prod?.name || a.product_id}</td>
                        <td className="px-4 py-3 text-xs">
                          {(() => {
                            const d = daysUntil(a.deadline)
                            if (d === null) return <span className="text-gray-300">—</span>
                            if (d < 0)  return <span className="text-red-600 font-semibold">⚠ {Math.abs(d)}d overdue</span>
                            if (d === 0) return <span className="text-orange-600 font-semibold">Due today</span>
                            if (d <= 3)  return <span className="text-amber-600">{d}d left</span>
                            return <span className="text-gray-500">{formatShortDate(a.deadline!)}</span>
                          })()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {a.attribute_sheet_handed_over
                            ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1 justify-center w-fit mx-auto"><CheckCircle2 className="h-3 w-3" />Handed over</span>
                            : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Pending</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/products/${a.prod?.id || a.product_id}?tab=merchandising`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">
                            Open <ArrowRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Early Sampling Queue ─────────────────────────────────────────── */}
        {isSamplingRole && show('early') && earlyForSampling.length > 0 && (
          <Card className="border-purple-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-purple-700 flex items-center gap-2">
                <Layers className="h-4 w-4" /> Approved Illustrations Ready for Sampling
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <p className="text-xs text-purple-600 px-6 pt-3 pb-2">
                These products are still in the design stage but have illustrations approved by the Design Head. You can start physical sampling now — before design formally completes.
              </p>
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Deadline</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-2" />
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {earlyForSampling.map(p => {
                    const deadline = (one(p.sales_data) as { deadline_date: string | null } | null)?.deadline_date ?? null
                    const d = daysUntil(deadline)
                    return (
                      <tr key={p.id} className={`hover:bg-purple-50 ${d !== null && d < 0 ? 'bg-red-50' : ''}`}>
                        <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                        <td className="px-4 py-3 text-xs">
                          {d === null ? <span className="text-gray-300">—</span>
                            : d < 0  ? <span className="text-red-600 font-semibold">⚠ {Math.abs(d)}d overdue</span>
                            : d === 0 ? <span className="text-orange-600 font-semibold">Due today</span>
                            : d <= 3  ? <span className="text-amber-600">{d}d left</span>
                            : <span className="text-gray-500">{formatShortDate(deadline!)}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                            <Layers className="h-3 w-3" /> Illustrations approved — design ongoing
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/products/${p.id}?tab=sampling`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">
                            Open <ArrowRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        {!isMerchTeamMember && show('pending') && pending.length > 0 && (
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
                    {isSamplingRole && <th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Designs</th>}
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Deadline</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Arrived</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pending.map(p => (
                    <tr key={p.id} className={`hover:bg-amber-50 ${isOverdue(p.deadline) ? 'bg-red-50' : ''}`}>
                      <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                      {isSamplingRole && (
                        <td className="px-4 py-3 text-center">
                          <span className="inline-block px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full text-xs font-medium">{p.designCount}</span>
                        </td>
                      )}
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

        {!isMerchTeamMember && show('completed') && completed.length > 0 && (
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

        {show('all') && (
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">All Products at {cfg.label} Stage</CardTitle></CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              {products.length === 0 ? (
                <p className="text-sm text-gray-400 px-6 py-8 text-center">No products at this stage yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Status</th>
                    <th className="px-4 py-2"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {products.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                        <td className="px-4 py-3">
                          {p.dept?.is_completed
                            ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Done</span>
                            : <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">In progress</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/products/${p.id}?tab=${cfg.tab}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">
                            Open <ArrowRight className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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

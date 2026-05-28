import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { STAGE_LABELS, STAGE_COLORS, ROLE_LABELS, CATEGORY_LABELS, type WorkflowStage, type UserRole, type ProductCategory } from '@/lib/types'
import { Progress } from '@/components/ui/progress'
import { ExportButton } from '@/components/reports/export-button'
import Link from 'next/link'

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

function daysBetween(start?: string | null, end?: string | null) {
  if (!start) return 0
  const endTime = end ? new Date(end).getTime() : Date.now()
  return Math.max(0, Math.floor((endTime - new Date(start).getTime()) / 86400000))
}

function isOverdue(date?: string | null) {
  if (!date) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return target < today
}

function StageBadge({ stage }: { stage: string }) {
  const color = STAGE_COLORS[stage as WorkflowStage] || 'bg-gray-100 text-gray-600'
  const label = STAGE_LABELS[stage as WorkflowStage] || stage
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{label}</span>
}

function stageOwnerLabel(stage: string) {
  switch (stage) {
    case 'draft': return 'Sales'
    case 'design_completed': return 'Design'
    case 'sampling_completed': return 'Sampling'
    case 'merchandising_completed': return 'Merchandising'
    case 'bom_finalized': return 'BOM'
    case 'marketing_ready': return 'Marketing'
    case 'sales_priced': return 'Admin'
    case 'product_live': return 'Live'
    default: return 'Unknown'
  }
}

export default async function ReportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const role: UserRole = profile?.role || 'viewer'

  const isManagement = ['admin', 'management', 'design_head'].includes(role)
  const isAdmin = role === 'admin'

  const [
    { data: productsRaw },
    { data: profiles },
    { data: designSubmissionsRaw },
    { data: activityLogsRaw },
    { data: pendingUnlocks },
  ] = await Promise.all([
    supabase.from('products')
      .select('id, name, sku, category, workflow_stage, created_at, updated_at, design_data(is_completed, updated_at), sampling_data(is_completed, sample_review_status, updated_at), merchandising_data(is_completed, updated_at), bom_data(is_completed, updated_at, fg_inv_code, cost_given), marketing_data(is_completed, updated_at), sales_data(is_completed, updated_at, deadline_date)'),
    isAdmin ? supabase.from('profiles').select('role, is_active') : Promise.resolve({ data: null, error: null }),
    isManagement
      ? supabase.from('design_submissions').select('submitted_by, status, created_at, reviewed_at, submitter:profiles!submitted_by(id, full_name)')
      : Promise.resolve({ data: null, error: null }),
    isManagement
      ? supabase.from('activity_logs').select('user_id, department, created_at, user:profiles(full_name)').order('created_at', { ascending: false }).limit(500)
      : Promise.resolve({ data: null, error: null }),
    isManagement
      ? supabase.from('stage_unlock_requests').select('id, stage, created_at, product:products(id, name, sku), requester:profiles!requested_by(full_name)').eq('status', 'pending').order('created_at', { ascending: true })
      : Promise.resolve({ data: null, error: null }),
  ])

  type ProductRow = {
    id: string
    name: string | null
    sku: string | null
    category: string
    workflow_stage: string
    created_at: string
    updated_at: string
    design_data: { is_completed: boolean; updated_at: string }[] | null
    sampling_data: { is_completed: boolean; sample_review_status: string; updated_at: string }[] | null
    merchandising_data: { is_completed: boolean; updated_at: string }[] | null
    bom_data: { is_completed: boolean; updated_at: string; fg_inv_code: string | null; cost_given: boolean }[] | null
    marketing_data: { is_completed: boolean; updated_at: string }[] | null
    sales_data: { is_completed: boolean; updated_at: string; deadline_date: string | null }[] | null
  }

  const products = (productsRaw || []) as unknown as ProductRow[]
  const total = products.length

  const byStage: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  for (const p of products) {
    byStage[p.workflow_stage] = (byStage[p.workflow_stage] || 0) + 1
    byCategory[p.category] = (byCategory[p.category] || 0) + 1
  }

  const byRole: Record<string, number> = {}
  for (const u of profiles || []) byRole[u.role] = (byRole[u.role] || 0) + 1
  const activeUsers = profiles?.filter((u) => u.is_active).length || 0

  const activeProducts = products.filter(p => p.workflow_stage !== 'product_live')
  const stageAging = Object.entries(STAGE_LABELS).map(([stage, label]) => {
    const rows = activeProducts.filter(p => p.workflow_stage === stage)
    const avgAge = rows.length > 0 ? Math.round(rows.reduce((sum, p) => sum + daysBetween(p.updated_at || p.created_at), 0) / rows.length) : 0
    return { stage, label, count: rows.length, avgAge, owner: stageOwnerLabel(stage) }
  }).filter(r => r.count > 0).sort((a, b) => b.avgAge - a.avgAge)

  const overdueProducts = activeProducts
    .map(p => ({ ...p, sales: one(p.sales_data) as { deadline_date: string | null } | null }))
    .filter(p => isOverdue(p.sales?.deadline_date))
    .sort((a, b) => new Date(a.sales?.deadline_date || '').getTime() - new Date(b.sales?.deadline_date || '').getTime())

  const launchForecast = products
    .filter(p => p.workflow_stage !== 'product_live')
    .map(p => ({
      ...p,
      sales: one(p.sales_data) as { deadline_date: string | null; is_completed: boolean } | null,
      designDone: !!(one(p.design_data) as { is_completed: boolean } | null)?.is_completed,
      samplingDone: !!(one(p.sampling_data) as { is_completed: boolean; sample_review_status: string } | null)?.is_completed && (one(p.sampling_data) as { sample_review_status: string } | null)?.sample_review_status === 'approved',
      merchDone: !!(one(p.merchandising_data) as { is_completed: boolean } | null)?.is_completed,
      bomDone: !!(one(p.bom_data) as { is_completed: boolean } | null)?.is_completed,
      marketingDone: !!(one(p.marketing_data) as { is_completed: boolean } | null)?.is_completed,
      salesDone: !!(one(p.sales_data) as { is_completed: boolean } | null)?.is_completed,
      bom: one(p.bom_data) as { fg_inv_code: string | null; cost_given: boolean } | null,
    }))
    .sort((a, b) => {
      const aDate = a.sales?.deadline_date ? new Date(a.sales.deadline_date).getTime() : Number.MAX_SAFE_INTEGER
      const bDate = b.sales?.deadline_date ? new Date(b.sales.deadline_date).getTime() : Number.MAX_SAFE_INTEGER
      return aDate - bDate
    })
    .slice(0, 10)

  const exceptionRows = products.flatMap(p => {
    const bom = one(p.bom_data) as { fg_inv_code: string | null; cost_given: boolean; is_completed: boolean } | null
    const sales = one(p.sales_data) as { deadline_date: string | null; is_completed: boolean } | null
    const issues: string[] = []
    if (!p.name) issues.push('Missing name')
    if (!p.sku) issues.push('Missing SKU')
    if (p.workflow_stage !== 'product_live' && !sales?.deadline_date) issues.push('No deadline')
    if (['bom_finalized', 'marketing_ready', 'sales_priced', 'product_live'].includes(p.workflow_stage) && !bom?.fg_inv_code) issues.push('Missing FG INV')
    if (['marketing_ready', 'sales_priced', 'product_live'].includes(p.workflow_stage) && !bom?.cost_given) issues.push('Cost not given')
    return issues.length > 0 ? [{ ...p, issues }] : []
  })

  const designerMap: Record<string, { name: string; total: number; approved: number; rejected: number; pending: number; avgReviewDays: number; reviewSamples: number[] }> = {}
  for (const row of designSubmissionsRaw || []) {
    const submitter = one(row.submitter) as { id: string; full_name: string } | null
    if (!submitter) continue
    if (!designerMap[submitter.id]) designerMap[submitter.id] = { name: submitter.full_name, total: 0, approved: 0, rejected: 0, pending: 0, avgReviewDays: 0, reviewSamples: [] }
    designerMap[submitter.id].total++
    if (row.status === 'approved') designerMap[submitter.id].approved++
    else if (row.status === 'rejected') designerMap[submitter.id].rejected++
    else designerMap[submitter.id].pending++
    if (row.reviewed_at) designerMap[submitter.id].reviewSamples.push(daysBetween(row.created_at, row.reviewed_at))
  }
  const designerStats = Object.values(designerMap)
    .map(d => ({ ...d, avgReviewDays: d.reviewSamples.length > 0 ? Math.round(d.reviewSamples.reduce((a, b) => a + b, 0) / d.reviewSamples.length) : 0 }))
    .sort((a, b) => b.total - a.total)

  const activityMap: Record<string, { name: string; total: number; departments: Set<string> }> = {}
  for (const log of activityLogsRaw || []) {
    if (!log.user_id) continue
    const user = one(log.user) as { full_name?: string } | null
    if (!activityMap[log.user_id]) activityMap[log.user_id] = { name: user?.full_name || 'Unknown', total: 0, departments: new Set() }
    activityMap[log.user_id].total++
    if (log.department) activityMap[log.user_id].departments.add(log.department)
  }
  const activityStats = Object.values(activityMap).sort((a, b) => b.total - a.total).slice(0, 10)

  const pipelineDone = byStage.product_live || 0
  const pipelineActive = total - pipelineDone

  return (
    <div>
      <Header title="Reports" subtitle={isManagement ? 'Management analytics and pipeline health' : 'Pipeline overview'} actions={isManagement ? <ExportButton /> : undefined} />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Products by Workflow Stage</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(STAGE_LABELS).map(([stage, label]) => {
                const count = byStage[stage] || 0
                const pct = total > 0 ? Math.round((count / total) * 100) : 0
                return (
                  <div key={stage}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STAGE_COLORS[stage as WorkflowStage]}`}>{label}</span>
                      <span className="text-sm font-semibold text-gray-900">{count} <span className="text-xs text-gray-400 font-normal">({pct}%)</span></span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Products by Category</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(byCategory).length > 0
                ? Object.entries(byCategory).sort(([, a], [, b]) => b - a).map(([cat, count]) => {
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0
                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm text-gray-700">{CATEGORY_LABELS[cat as ProductCategory] || cat}</span>
                          <span className="text-sm font-semibold text-gray-900">{count} <span className="text-xs text-gray-400 font-normal">({pct}%)</span></span>
                        </div>
                        <Progress value={pct} className="h-2" />
                      </div>
                    )
                  })
                : <p className="text-sm text-gray-400">No products yet.</p>
              }
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pipeline Summary</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Products', value: total, color: 'text-blue-600' },
              { label: 'Active Pipeline', value: pipelineActive, color: 'text-purple-600' },
              { label: 'Live Products', value: pipelineDone, color: 'text-green-600' },
              { label: 'Overdue', value: overdueProducts.length, color: overdueProducts.length > 0 ? 'text-red-600' : 'text-gray-500' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center py-4 rounded-lg bg-gray-50">
                <p className={`text-3xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {isManagement && (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Bottleneck & Aging Report</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Stage</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Owner</th>
                        <th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Count</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Avg Idle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {stageAging.map(row => (
                        <tr key={row.stage} className="hover:bg-gray-50">
                          <td className="px-6 py-3"><StageBadge stage={row.stage} /></td>
                          <td className="px-4 py-3 text-gray-600">{row.owner}</td>
                          <td className="px-4 py-3 text-center font-semibold">{row.count}</td>
                          <td className={`px-4 py-3 text-right text-xs font-semibold ${row.avgAge >= 7 ? 'text-amber-600' : 'text-gray-500'}`}>{row.avgAge}d</td>
                        </tr>
                      ))}
                      {stageAging.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-sm text-gray-400">No active pipeline items.</td></tr>}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Overdue Products</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                        <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Stage</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Deadline</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {overdueProducts.slice(0, 10).map(p => (
                        <tr key={p.id} className="hover:bg-red-50">
                          <td className="px-6 py-3"><Link href={`/products/${p.id}`} className="font-medium text-gray-900 hover:text-blue-600">{p.name || p.sku}</Link></td>
                          <td className="px-4 py-3"><StageBadge stage={p.workflow_stage} /></td>
                          <td className="px-4 py-3 text-right text-xs font-semibold text-red-600">{new Date(p.sales?.deadline_date || '').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td>
                        </tr>
                      ))}
                      {overdueProducts.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-sm text-gray-400">No overdue products.</td></tr>}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Launch Forecast & Readiness</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Stage</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Readiness</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase">FG INV</th>
                      <th className="text-right px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Deadline</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {launchForecast.map(p => {
                      const done = [p.designDone, p.samplingDone, p.merchDone, p.bomDone, p.marketingDone, p.salesDone].filter(Boolean).length
                      const pct = Math.round((done / 6) * 100)
                      return (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-6 py-3"><Link href={`/products/${p.id}`} className="font-medium text-gray-900 hover:text-blue-600">{p.name || p.sku}</Link></td>
                          <td className="px-4 py-3"><StageBadge stage={p.workflow_stage} /></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Progress value={pct} className="h-2" />
                              <span className="text-xs font-semibold text-gray-500 w-9 text-right">{pct}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-xs">{p.bom?.fg_inv_code || <span className="text-gray-300">Missing</span>}</td>
                          <td className={`px-4 py-3 text-right text-xs ${isOverdue(p.sales?.deadline_date) ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                            {p.sales?.deadline_date ? new Date(p.sales.deadline_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'No deadline'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Design Rework Report</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Designer</th>
                        <th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Submitted</th>
                        <th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Rejected</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Review Avg</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {designerStats.map(d => (
                        <tr key={d.name} className="hover:bg-gray-50">
                          <td className="px-6 py-3 font-medium text-gray-900">{d.name}</td>
                          <td className="px-4 py-3 text-center">{d.total}</td>
                          <td className={`px-4 py-3 text-center font-semibold ${d.rejected > 0 ? 'text-red-600' : 'text-gray-500'}`}>{d.rejected}</td>
                          <td className="px-4 py-3 text-right text-xs text-gray-500">{d.avgReviewDays}d</td>
                        </tr>
                      ))}
                      {designerStats.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-sm text-gray-400">No design submissions yet.</td></tr>}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">User Activity Report</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">User</th>
                        <th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Updates</th>
                        <th className="text-right px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Departments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {activityStats.map(u => (
                        <tr key={u.name} className="hover:bg-gray-50">
                          <td className="px-6 py-3 font-medium text-gray-900">{u.name}</td>
                          <td className="px-4 py-3 text-center font-semibold">{u.total}</td>
                          <td className="px-4 py-3 text-right text-xs text-gray-500">{Array.from(u.departments).join(', ') || '-'}</td>
                        </tr>
                      ))}
                      {activityStats.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-sm text-gray-400">No activity yet.</td></tr>}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Exception Report</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {exceptionRows.slice(0, 12).map(p => (
                    <div key={p.id} className="flex items-center justify-between border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                      <div>
                        <Link href={`/products/${p.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">{p.name || p.sku || 'Unnamed product'}</Link>
                        <p className="text-xs text-amber-600">{p.issues.join(', ')}</p>
                      </div>
                      <StageBadge stage={p.workflow_stage} />
                    </div>
                  ))}
                  {exceptionRows.length === 0 && <p className="text-sm text-gray-400">No data exceptions found.</p>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Admin Attention Queue</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {(pendingUnlocks || []).map(req => {
                    const product = one(req.product) as { id: string; name?: string | null; sku?: string | null } | null
                    const requester = one(req.requester) as { full_name?: string | null } | null
                    return (
                      <div key={req.id} className="flex items-center justify-between border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{product?.name || product?.sku || 'Product'}</p>
                          <p className="text-xs text-gray-500">{requester?.full_name || 'User'} requested unlock {daysBetween(req.created_at)}d ago</p>
                        </div>
                        {product?.id && <Link href={`/products/${product.id}`} className="text-xs text-blue-600 hover:underline">Open</Link>}
                      </div>
                    )
                  })}
                  {(pendingUnlocks || []).length === 0 && <p className="text-sm text-gray-400">No pending unlock requests.</p>}
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Team by Role</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(ROLE_LABELS).map(([roleName, label]) => {
                const count = byRole[roleName] || 0
                return count > 0 ? (
                  <div key={roleName} className="rounded-lg bg-gray-50 px-4 py-3">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-2xl font-bold text-gray-900">{count}</p>
                  </div>
                ) : null
              })}
              <div className="rounded-lg bg-green-50 px-4 py-3">
                <p className="text-xs text-green-700">Active users</p>
                <p className="text-2xl font-bold text-green-700">{activeUsers}</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

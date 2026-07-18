import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Package, TrendingUp, Clock, CheckCircle2, ArrowRight, AlertCircle, CalendarDays } from 'lucide-react'
import Link from 'next/link'
import { STAGE_LABELS, type WorkflowStage } from '@/lib/types'
import { one, formatDateTime, formatShortDate, daysSince, daysUntil, isOverdue } from '@/lib/utils'
import type { Profile } from '@/lib/types'
import { KpiCard, StageBadge } from './_shared'
import { UnlockRequestsPanel, type UnlockRequest } from './_unlock-requests'

// Pipeline products are paginated for detailed per-product panels (exceptions, launch readiness).
// Bottleneck counts use a separate global query; aging uses activity_logs for accurate stage-entry times.
const PAGE_SIZE = 50

type ManagementProduct = {
  id: string; name: string | null; sku: string | null
  workflow_stage: string; created_at: string; updated_at: string
  design_data:        { is_completed: boolean; updated_at: string }[] | null
  sampling_data?:     { is_completed: boolean; sample_review_status: string; updated_at: string }[] | null
  merchandising_data: { is_completed: boolean; updated_at: string }[] | null
  bom_data:           { is_completed: boolean; updated_at: string; fg_inv_code: string | null }[] | null
  marketing_data:     { is_completed: boolean; updated_at: string }[] | null
  sales_data:         { is_completed: boolean; updated_at: string; deadline_date: string | null }[] | null
}

export async function AdminDashboard({ profile, filter, page }: { profile: Profile; filter?: string; page: number }) {
  const show = (key: string) => !filter || filter === key
  const supabase = await createClient()

  const offset = (page - 1) * PAGE_SIZE

  const [
    { count: totalProducts },
    { count: liveProducts },
    { count: inProgressProducts },
    { data: recentProducts },
    { data: recentLogs },
    { data: managementProducts, count: activeCount },
    { count: designComplete },
    { count: samplingComplete },
    { count: merchComplete },
    { count: bomComplete },
    { count: marketingComplete },
    { count: salesComplete },
    { data: pendingSamples },
    { data: allActiveStagesData },
    { data: stageEntryLogs },
    { data: rawUnlockRequests },
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('workflow_stage', 'product_live'),
    supabase.from('products').select('*', { count: 'exact', head: true }).neq('workflow_stage', 'product_live'),
    supabase.from('products').select('id, name, sku, workflow_stage, created_at, bom_data(fg_inv_code)').order('created_at', { ascending: false }).limit(6),
    supabase.from('activity_logs').select('*, user:profiles(full_name), product:products(name, sku)').order('created_at', { ascending: false }).limit(8),
    supabase.from('products')
      .select('id, name, sku, workflow_stage, created_at, updated_at, design_data(is_completed, updated_at), sampling_data(is_completed, sample_review_status, updated_at), merchandising_data(is_completed, updated_at), bom_data(is_completed, updated_at, fg_inv_code), marketing_data(is_completed, updated_at), sales_data(is_completed, updated_at, deadline_date)', { count: 'exact' })
      .not('workflow_stage', 'eq', 'product_live')
      .order('updated_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1),
    supabase.from('design_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
    supabase.from('sampling_data').select('*', { count: 'exact', head: true }).eq('sample_review_status', 'approved'),
    supabase.from('merchandising_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
    supabase.from('bom_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
    supabase.from('marketing_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
    supabase.from('sales_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
    supabase.from('sampling_data')
      .select('product_id, sample_review_status, updated_at, product:products(id, name, workflow_stage)')
      .eq('sample_review_status', 'pending_review'),
    // Global stage distribution for bottleneck (all active products, not paged)
    supabase.from('products')
      .select('workflow_stage')
      .not('workflow_stage', 'eq', 'product_live'),
    // Stage entry timestamps for accurate aging (most recent stage-advance per product)
    supabase.from('activity_logs')
      .select('product_id, created_at')
      .ilike('action', 'advanced stage to%')
      .order('created_at', { ascending: false })
      .limit(2000),
    // Pending stage unlock requests
    supabase.from('stage_unlock_requests')
      .select('id, product_id, stage, reason, created_at, requester:profiles!requested_by(full_name), product:products(id, name)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true }),
  ])

  const total    = totalProducts || 0
  const deptDone = (designComplete || 0) + (samplingComplete || 0) + (merchComplete || 0) + (bomComplete || 0) + (marketingComplete || 0) + (salesComplete || 0)
  const deptTotal = total * 6
  const deptRate  = deptTotal > 0 ? Math.round((deptDone / deptTotal) * 100) : 0
  const pendingSampleApproval = (pendingSamples || []).length
  const totalPages = Math.ceil((activeCount || 0) / PAGE_SIZE)

  const mgmtProducts    = (managementProducts || []) as unknown as ManagementProduct[]

  // Global bottleneck: counts across ALL active products (not just current page)
  const globalStageCounts = (allActiveStagesData || []).reduce<Record<string, number>>((acc, p) => {
    const stage = (p as { workflow_stage: string }).workflow_stage
    acc[stage] = (acc[stage] || 0) + 1
    return acc
  }, {})
  const globalActiveCount = (allActiveStagesData || []).length
  const bottlenecks = Object.entries(globalStageCounts)
    .map(([stage, count]) => ({ stage, count, owner: STAGE_LABELS[stage as WorkflowStage] ?? stage }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  // Accurate aging: time since last stage transition (from activity_logs), not last updated_at
  const stageEntryMap: Record<string, string> = {}
  for (const log of stageEntryLogs || []) {
    const l = log as { product_id: string | null; created_at: string }
    if (l.product_id && !stageEntryMap[l.product_id]) stageEntryMap[l.product_id] = l.created_at
  }
  const stuckProducts = mgmtProducts
    .map(p => ({ ...p, ageDays: daysSince(stageEntryMap[p.id] || p.created_at) }))
    .filter(p => p.ageDays >= 7)
    .sort((a, b) => b.ageDays - a.ageDays)
    .slice(0, 6)

  // Pending unlock requests normalised for the client component
  const pendingUnlockRequests: UnlockRequest[] = (rawUnlockRequests || []).map(r => {
    const req = r as {
      id: string; product_id: string; stage: string; reason: string | null; created_at: string
      requester: { full_name: string } | { full_name: string }[] | null
      product: { id: string; name: string } | { id: string; name: string }[] | null
    }
    return {
      id: req.id,
      product_id: req.product_id,
      stage: req.stage as WorkflowStage,
      reason: req.reason,
      created_at: req.created_at,
      requesterName: (one(req.requester) as { full_name: string } | null)?.full_name ?? null,
      productName: (one(req.product) as { name: string } | null)?.name ?? null,
    }
  })
  const overdueProducts = mgmtProducts.map(p => ({ ...p, sales: one(p.sales_data) as { deadline_date: string | null } | null })).filter(p => isOverdue(p.sales?.deadline_date)).sort((a, b) => new Date(a.sales?.deadline_date || '').getTime() - new Date(b.sales?.deadline_date || '').getTime()).slice(0, 6)
  const upcomingDeadlines = mgmtProducts
    .map(p => ({ ...p, sales: one(p.sales_data) as { deadline_date: string | null } | null }))
    .map(p => ({ ...p, daysLeft: daysUntil(p.sales?.deadline_date ?? null) }))
    .filter(p => p.daysLeft !== null && p.daysLeft >= 0 && p.daysLeft <= 7)
    .sort((a, b) => (a.daysLeft ?? 99) - (b.daysLeft ?? 99))
    .slice(0, 6)
  const launchReadiness = mgmtProducts
    .filter(p => ['bom_finalized', 'marketing_ready', 'sales_priced'].includes(p.workflow_stage))
    .map(p => ({
      ...p,
      designDone:    !!(one(p.design_data)        as { is_completed: boolean } | null)?.is_completed,
      samplingDone:  !!(one(p.sampling_data)      as { is_completed: boolean; sample_review_status: string } | null)?.is_completed && (one(p.sampling_data) as { sample_review_status: string } | null)?.sample_review_status === 'approved',
      merchDone:     !!(one(p.merchandising_data) as { is_completed: boolean } | null)?.is_completed,
      bomDone:       !!(one(p.bom_data)           as { is_completed: boolean } | null)?.is_completed,
      marketingDone: !!(one(p.marketing_data)     as { is_completed: boolean } | null)?.is_completed,
      salesDone:     !!(one(p.sales_data)         as { is_completed: boolean } | null)?.is_completed,
      fgInv:          (one(p.bom_data)            as { fg_inv_code: string | null } | null)?.fg_inv_code,
    })).slice(0, 6)
  const exceptions = mgmtProducts.flatMap(p => {
    const bom   = one(p.bom_data)   as { fg_inv_code: string | null } | null
    const sales = one(p.sales_data) as { deadline_date: string | null } | null
    const issues: string[] = []
    if (!p.sku) issues.push('Missing SKU')
    if (['bom_finalized', 'marketing_ready', 'sales_priced', 'product_live'].includes(p.workflow_stage) && !bom?.fg_inv_code) issues.push('Missing FG INV')
    if (p.workflow_stage !== 'product_live' && !sales?.deadline_date) issues.push('No deadline')
    return issues.length ? [{ ...p, issues }] : []
  }).slice(0, 6)

  return (
    <div>
      <Header title="Dashboard" subtitle="Full pipeline overview" />
      <div className="p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Products" value={total}                    icon={Package}      color="bg-blue-50 [&>svg]:text-blue-600" />
          <KpiCard label="Live Products"  value={liveProducts || 0}        icon={CheckCircle2} color="bg-green-50 [&>svg]:text-green-600" />
          <KpiCard label="In Progress"    value={inProgressProducts || 0}  sub="Active pipeline" icon={Clock} color="bg-amber-50 [&>svg]:text-amber-500" />
          {pendingSampleApproval > 0 && (
            <KpiCard label="Sample Approval" value={pendingSampleApproval} sub="awaiting approval" icon={CheckCircle2} color="bg-cyan-50 [&>svg]:text-cyan-600" href="?f=sample-approval" active={filter === 'sample-approval'} />
          )}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">Dept. Completion</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{deptRate}%</p>
                  <p className="text-xs text-gray-400 mt-0.5">{deptDone} / {deptTotal} departments</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-purple-50 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-purple-600" />
                </div>
              </div>
              <Progress value={deptRate} className="mt-3" />
            </CardContent>
          </Card>
        </div>

        {pendingUnlockRequests.length > 0 && (
          <UnlockRequestsPanel requests={pendingUnlockRequests} adminId={profile.id} />
        )}

        {show('sample-approval') && pendingSampleApproval > 0 && (
          <Card className="border-cyan-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-cyan-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Samples Awaiting Approval
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Submitted</th>
                  <th className="px-4 py-2"></th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {(pendingSamples || []).map(s => {
                    const prod = one(s.product) as { id: string; name: string } | null
                    return (
                      <tr key={s.product_id} className="hover:bg-cyan-50">
                        <td className="px-6 py-3 font-medium text-gray-900">{prod?.name ?? s.product_id}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{s.updated_at ? `${daysSince(s.updated_at)}d ago` : 'Today'}</td>
                        <td className="px-4 py-3 text-right"><Link href={`/products/${s.product_id}?tab=sampling`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">Review Sample <ArrowRight className="h-3 w-3" /></Link></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600" /> Bottleneck Stages
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {bottlenecks.length > 0 ? bottlenecks.map(item => {
                const pct = globalActiveCount > 0 ? Math.round((item.count / globalActiveCount) * 100) : 0
                return (
                  <div key={item.stage}>
                    <div className="flex items-center justify-between mb-1">
                      <div><StageBadge stage={item.stage} /><span className="ml-2 text-xs text-gray-500">{item.owner}</span></div>
                      <span className="text-sm font-semibold text-gray-900">{item.count}</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                  </div>
                )
              }) : <p className="text-sm text-gray-400">No active bottlenecks.</p>}
            </CardContent>
          </Card>

          <Card className={overdueProducts.length > 0 ? 'border-red-100' : ''}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-500" /> Critical Exceptions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {overdueProducts.slice(0, 3).map(p => (
                <div key={`overdue-${p.id}`} className="flex items-center justify-between border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                  <div>
                    <Link href={`/products/${p.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">{p.name || p.sku}</Link>
                    <p className="text-xs text-red-600">Deadline: {formatShortDate(p.sales?.deadline_date || '')}</p>
                  </div>
                  <StageBadge stage={p.workflow_stage} />
                </div>
              ))}
              {exceptions.slice(0, Math.max(0, 4 - overdueProducts.length)).map(p => (
                <div key={`exception-${p.id}`} className="flex items-center justify-between border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                  <div>
                    <Link href={`/products/${p.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">{p.name || p.sku || 'Unnamed product'}</Link>
                    <p className="text-xs text-amber-600">{p.issues.join(', ')}</p>
                  </div>
                  <StageBadge stage={p.workflow_stage} />
                </div>
              ))}
              {overdueProducts.length === 0 && exceptions.length === 0 && <p className="text-sm text-gray-400">No critical exceptions found.</p>}
            </CardContent>
          </Card>

          {upcomingDeadlines.length > 0 && (
            <Card className="border-orange-200 xl:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-orange-700">
                  <CalendarDays className="h-4 w-4" /> Deadlines in the Next 7 Days ({upcomingDeadlines.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Stage</th>
                    <th className="text-right px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Deadline</th>
                    <th className="px-4 py-2" />
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {upcomingDeadlines.map(p => (
                      <tr key={`upcoming-${p.id}`} className="hover:bg-orange-50">
                        <td className="px-6 py-3"><Link href={`/products/${p.id}`} className="font-medium text-gray-900 hover:text-blue-600">{p.name || p.sku}</Link></td>
                        <td className="px-4 py-3"><StageBadge stage={p.workflow_stage} /></td>
                        <td className="px-4 py-3 text-right text-xs">
                          {p.daysLeft === 0
                            ? <span className="font-semibold text-red-600">Due today</span>
                            : <span className="text-amber-600 font-medium">{p.daysLeft}d · {formatShortDate(p.sales?.deadline_date || '')}</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/products/${p.id}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">Open <ArrowRight className="h-3 w-3" /></Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" /> Aging Watchlist
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Stage</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Idle</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {stuckProducts.map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3"><Link href={`/products/${p.id}`} className="font-medium text-gray-900 hover:text-blue-600">{p.name || p.sku}</Link></td>
                      <td className="px-4 py-3"><StageBadge stage={p.workflow_stage} /></td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-amber-600">{p.ageDays}d</td>
                    </tr>
                  ))}
                  {stuckProducts.length === 0 && <tr><td colSpan={3} className="text-center py-6 text-sm text-gray-400">Nothing idle for 7+ days.</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" /> Launch Readiness
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {launchReadiness.length > 0 ? launchReadiness.map(p => {
                const done = [p.designDone, p.samplingDone, p.merchDone, p.bomDone, p.marketingDone, p.salesDone].filter(Boolean).length
                const pct  = Math.round((done / 6) * 100)
                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between mb-1">
                      <Link href={`/products/${p.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">{p.name || p.sku}</Link>
                      <span className="text-xs font-semibold text-gray-500">{pct}%</span>
                    </div>
                    <Progress value={pct} className="h-2" />
                    <p className="text-xs text-gray-400 mt-1">{p.fgInv ? `FG INV ${p.fgInv}` : 'FG INV pending'}</p>
                  </div>
                )
              }) : <p className="text-sm text-gray-400">No products near launch yet.</p>}
            </CardContent>
          </Card>
        </div>

        {/* Pipeline pagination — shows which page of active products the analysis covers */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-gray-500 bg-gray-50 rounded-lg px-4 py-3">
            <span>Detailed panels cover page {page} of {totalPages} ({PAGE_SIZE} products/page). Bottleneck analysis covers all {globalActiveCount} active products.</span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={`?page=${page - 1}${filter ? `&f=${filter}` : ''}`} className="text-blue-600 hover:underline">← Previous</Link>
              )}
              {page < totalPages && (
                <Link href={`?page=${page + 1}${filter ? `&f=${filter}` : ''}`} className="text-blue-600 hover:underline">Next →</Link>
              )}
            </div>
          </div>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Products</CardTitle>
            <Link href="/products" className="text-sm text-blue-600 hover:underline flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></Link>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                <th className="text-left pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Product Name</th>
                <th className="text-center pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Stage</th>
                <th className="text-right pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">FG INV</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {recentProducts?.map(p => {
                  const bom = one(p.bom_data) as { fg_inv_code?: string | null } | null
                  return (
                    <tr key={p.id} className="group hover:bg-gray-50">
                      <td className="py-3"><Link href={`/products/${p.id}`} className="font-medium text-gray-900 group-hover:text-blue-600">{p.name || p.sku}</Link></td>
                      <td className="py-3 text-center"><StageBadge stage={p.workflow_stage} /></td>
                      <td className="py-3 text-right">{bom?.fg_inv_code ? <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{bom.fg_inv_code}</span> : <span className="text-gray-300 text-xs">—</span>}</td>
                    </tr>
                  )
                })}
                {(!recentProducts || recentProducts.length === 0) && (
                  <tr><td colSpan={3} className="text-center py-6 text-sm text-gray-400">No products yet. <Link href="/products" className="text-blue-600 hover:underline">Create one</Link></td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentLogs?.map(log => {
                const user    = one(log.user)    as { full_name?: string } | null
                const product = one(log.product) as { name?: string; sku?: string } | null
                const label   = product?.name || product?.sku || ''
                return (
                  <div key={log.id} className="flex items-start gap-3">
                    <div className="h-2 w-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                    <div>
                      <p className="text-sm text-gray-900">
                        <span className="font-medium">{user?.full_name || 'System'}</span>{' '}{log.action}
                        {label && <span className="text-gray-500"> · {label}</span>}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(log.created_at)}</p>
                    </div>
                  </div>
                )
              })}
              {(!recentLogs || recentLogs.length === 0) && <p className="text-sm text-gray-400 text-center py-4">No activity yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

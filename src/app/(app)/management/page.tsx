import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Clock, XCircle, ImageIcon, Send, TrendingUp, Users, CalendarDays, Timer } from 'lucide-react'

// Supabase foreign-key joins may return a single object OR an array depending on cardinality.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function one<T>(v: T | T[] | null | undefined): T | null { return Array.isArray(v) ? (v[0] ?? null) : (v ?? null) }

function diffDays(from: string | null, to: string | null): number | null {
  if (!from || !to) return null
  const ms = new Date(to).getTime() - new Date(from).getTime()
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)))
}

function fmt(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

function fmtDays(n: number | null) {
  if (n === null) return '—'
  if (n === 0) return 'Same day'
  return `${n}d`
}

export default async function ManagementPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()

  if (!['admin', 'management'].includes(profile?.role ?? '')) redirect('/dashboard')

  const [
    { data: allSubmissions },
    { data: designDataRows },
    { data: assignmentLogs },
    { data: designFiles },
    { data: actorProfiles },
  ] = await Promise.all([
    supabase.from('design_submissions')
      .select('id, product_id, submitted_by, status, created_at, reviewed_at, feedback, product:products(id,name), submitter:profiles!submitted_by(id,full_name)')
      .order('created_at', { ascending: true })
      .limit(2000),
    supabase.from('design_data')
      .select('product_id, assigned_to, is_completed, product:products(id,name,workflow_stage), assignee:profiles!assigned_to(id,full_name)')
      .not('assigned_to', 'is', null),
    supabase.from('activity_logs')
      .select('product_id, created_at, action, user_id')
      .ilike('action', 'assigned design to%')
      .order('created_at', { ascending: false }),
    supabase.from('product_files')
      .select('product_id, uploaded_by, created_at')
      .eq('department', 'design')
      .like('file_type', 'image/%'),
    supabase.from('profiles')
      .select('id, full_name')
      .in('role', ['admin', 'design_head']),
  ])

  // ── Latest assignment date per product ──────────────────────────────────────
  const latestAssignDate: Record<string, string> = {}
  for (const log of assignmentLogs || []) {
    if (!log.product_id || latestAssignDate[log.product_id]) continue
    if (!log.action.toLowerCase().includes('unassigned')) {
      latestAssignDate[log.product_id] = log.created_at
    }
  }

  // ── Per-product submission summary ──────────────────────────────────────────
  type ProductSub = { firstSubmit: string | null; approvedAt: string | null; total: number; approved: number; rejected: number; pending: number }
  const productSubMap: Record<string, ProductSub> = {}
  for (const sub of allSubmissions || []) {
    if (!sub.product_id) continue
    if (!productSubMap[sub.product_id]) {
      productSubMap[sub.product_id] = { firstSubmit: null, approvedAt: null, total: 0, approved: 0, rejected: 0, pending: 0 }
    }
    const p = productSubMap[sub.product_id]
    p.total++
    if (!p.firstSubmit) p.firstSubmit = sub.created_at
    if (sub.status === 'approved') { p.approved++; if (!p.approvedAt) p.approvedAt = sub.reviewed_at }
    else if (sub.status === 'rejected') p.rejected++
    else p.pending++
  }

  // ── Per-designer stats ───────────────────────────────────────────────────────
  type DesignerStat = {
    id: string; name: string
    assignedProducts: string[]   // product_ids
    imagesUploaded: number
    total: number; approved: number; rejected: number; pending: number
    daysToSubmitList: number[]
  }
  const designerMap: Record<string, DesignerStat> = {}

  // Count assignments
  for (const dd of designDataRows || []) {
    const assignee = one(dd.assignee) as { id: string; full_name: string } | null
    if (!assignee) continue
    if (!designerMap[assignee.id]) {
      designerMap[assignee.id] = { id: assignee.id, name: assignee.full_name, assignedProducts: [], imagesUploaded: 0, total: 0, approved: 0, rejected: 0, pending: 0, daysToSubmitList: [] }
    }
    designerMap[assignee.id].assignedProducts.push(dd.product_id)
  }

  // Count submissions
  for (const sub of allSubmissions || []) {
    const submitter = one(sub.submitter) as { id: string; full_name: string } | null
    if (!submitter) continue
    if (!designerMap[submitter.id]) {
      designerMap[submitter.id] = { id: submitter.id, name: submitter.full_name, assignedProducts: [], imagesUploaded: 0, total: 0, approved: 0, rejected: 0, pending: 0, daysToSubmitList: [] }
    }
    const stat = designerMap[submitter.id]
    stat.total++
    if (sub.status === 'approved') stat.approved++
    else if (sub.status === 'rejected') stat.rejected++
    else stat.pending++
  }

  // Count images
  for (const f of designFiles || []) {
    if (!f.uploaded_by || !designerMap[f.uploaded_by]) continue
    designerMap[f.uploaded_by].imagesUploaded++
  }

  // Pre-index first submission per product to avoid O(n*m) find inside loop
  const firstSubByProduct = new Map<string, { submitter: unknown }>()
  for (const sub of allSubmissions || []) {
    if (!sub.product_id || firstSubByProduct.has(sub.product_id)) continue
    firstSubByProduct.set(sub.product_id, sub)
  }

  // Avg days from assignment to first submission (per product)
  for (const [productId, pSub] of Object.entries(productSubMap)) {
    const assignDate = latestAssignDate[productId]
    if (!assignDate || !pSub.firstSubmit) continue
    const days = diffDays(assignDate, pSub.firstSubmit)
    if (days === null) continue
    const firstSub = firstSubByProduct.get(productId)
    const submitter = one(firstSub?.submitter) as { id: string } | null
    if (submitter && designerMap[submitter.id]) {
      designerMap[submitter.id].daysToSubmitList.push(days)
    }
  }

  const designerStats = Object.values(designerMap).sort((a, b) => b.total - a.total)

  // ── Product timeline rows ────────────────────────────────────────────────────
  const productTimeline = (designDataRows || []).map(dd => {
    const assignee = one(dd.assignee) as { id: string; full_name: string } | null
    const product = one(dd.product) as { id: string; name: string; workflow_stage: string } | null
    const assignDate = latestAssignDate[dd.product_id] || null
    const pSub = productSubMap[dd.product_id]
    const daysToSubmit = diffDays(assignDate, pSub?.firstSubmit ?? null)
    const daysToApprove = diffDays(pSub?.firstSubmit ?? null, pSub?.approvedAt ?? null)
    const totalDays = diffDays(assignDate, pSub?.approvedAt ?? new Date().toISOString())
    return {
      productId: dd.product_id,
      productName: product?.name || dd.product_id,
      stage: product?.workflow_stage || '',
      designerName: assignee?.full_name || '—',
      assignDate,
      firstSubmit: pSub?.firstSubmit ?? null,
      approvedAt: pSub?.approvedAt ?? null,
      daysToSubmit,
      daysToApprove,
      totalDays,
      totalSubmissions: pSub?.total ?? 0,
      approved: pSub?.approved ?? 0,
      rejected: pSub?.rejected ?? 0,
      pending: pSub?.pending ?? 0,
    }
  }).sort((a, b) => {
    // Active/pending first, then by assign date newest first
    if (a.approvedAt && !b.approvedAt) return 1
    if (!a.approvedAt && b.approvedAt) return -1
    return (b.assignDate || '').localeCompare(a.assignDate || '')
  })

  // ── Overall KPIs ────────────────────────────────────────────────────────────
  const totalAssigned    = (designDataRows || []).length
  const totalSubmissions = (allSubmissions || []).length
  const totalApproved    = (allSubmissions || []).filter(s => s.status === 'approved').length
  const totalPending     = (allSubmissions || []).filter(s => s.status === 'pending').length
  const totalReviewed    = (allSubmissions || []).filter(s => s.status !== 'pending').length
  const approvalRate     = totalReviewed > 0 ? Math.round((totalApproved / totalReviewed) * 100) : null
  const allDays          = designerStats.flatMap(d => d.daysToSubmitList)
  const avgDaysToSubmit  = allDays.length > 0 ? Math.round(allDays.reduce((a, b) => a + b, 0) / allDays.length) : null

  // ── Actor profile map (for assignment log) ───────────────────────────────────
  const actorMap = new Map<string, string>()
  for (const p of actorProfiles || []) actorMap.set(p.id, p.full_name)

  // ── Assignment log rows ──────────────────────────────────────────────────────
  // One row per product showing latest assignment + completion info
  const assignmentReport = (designDataRows || []).map(dd => {
    const assignee = one(dd.assignee) as { id: string; full_name: string } | null
    const product = one(dd.product) as { id: string; name: string; workflow_stage: string } | null
    const assignedOn = latestAssignDate[dd.product_id] || null
    const latestLog = (assignmentLogs || []).find(l => l.product_id === dd.product_id)
    const assignedBy = latestLog?.user_id ? (actorMap.get(latestLog.user_id) || '—') : '—'
    const pSub = productSubMap[dd.product_id]
    const completedOn = pSub?.approvedAt ?? null
    return {
      productId: dd.product_id,
      productName: product?.name || dd.product_id,
      assignedTo: assignee?.full_name || '—',
      assignedBy,
      assignedOn,
      completedOn,
      isCompleted: !!completedOn,
    }
  }).sort((a, b) => (b.assignedOn || '').localeCompare(a.assignedOn || ''))

  // ── Recent submissions (newest first) ───────────────────────────────────────
  const recentSubs = [...(allSubmissions || [])].reverse().slice(0, 8)

  return (
    <div>
      <Header title="Management Dashboard" subtitle="Design team performance and product timelines" />
      <div className="p-6 space-y-6">

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Active Assignments</p>
                  <p className="text-3xl font-bold text-gray-900">{totalAssigned}</p>
                  <p className="text-xs text-gray-400 mt-1">products with a designer</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Users className="h-6 w-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Total Submissions</p>
                  <p className="text-3xl font-bold text-gray-900">{totalSubmissions}</p>
                  <p className="text-xs text-gray-400 mt-1">{totalApproved} approved · {totalPending} pending</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-purple-50 flex items-center justify-center">
                  <Send className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Approval Rate</p>
                  <p className={`text-3xl font-bold ${approvalRate === null ? 'text-gray-400' : approvalRate >= 70 ? 'text-green-600' : approvalRate >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>{approvalRate !== null ? `${approvalRate}%` : '—'}</p>
                  <p className="text-xs text-gray-400 mt-1">{approvalRate !== null ? 'of reviewed submissions' : 'no reviews yet'}</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-green-50 flex items-center justify-center">
                  <TrendingUp className="h-6 w-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Avg Days to Submit</p>
                  <p className="text-3xl font-bold text-gray-900">{avgDaysToSubmit !== null ? `${avgDaysToSubmit}d` : '—'}</p>
                  <p className="text-xs text-gray-400 mt-1">assignment → first submission</p>
                </div>
                <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center">
                  <Timer className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Designer performance */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" /> Designer Performance
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {designerStats.length === 0 ? (
              <p className="text-sm text-gray-400 px-6 py-4">No design assignments yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Designer</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Assigned</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">
                        <ImageIcon className="h-3 w-3 inline mr-1" />Images
                      </th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Submitted</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-green-600 uppercase">Approved</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-red-500 uppercase">Rejected</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-yellow-600 uppercase">Pending</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Approval %</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Avg Days</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {designerStats.map(d => {
                      const reviewed = d.approved + d.rejected
                      const rate = reviewed > 0 ? Math.round((d.approved / reviewed) * 100) : null
                      const avgDays = d.daysToSubmitList.length > 0
                        ? Math.round(d.daysToSubmitList.reduce((a, b) => a + b, 0) / d.daysToSubmitList.length)
                        : null
                      return (
                        <tr key={d.id} className="hover:bg-gray-50">
                          <td className="px-6 py-3.5 font-medium text-gray-900">{d.name}</td>
                          <td className="px-4 py-3.5 text-center text-gray-700">{d.assignedProducts.length}</td>
                          <td className="px-4 py-3.5 text-center text-gray-700">{d.imagesUploaded}</td>
                          <td className="px-4 py-3.5 text-center text-gray-700">{d.total}</td>
                          <td className="px-4 py-3.5 text-center font-semibold text-green-600">{d.approved}</td>
                          <td className="px-4 py-3.5 text-center font-semibold text-red-500">{d.rejected}</td>
                          <td className="px-4 py-3.5 text-center text-yellow-600">{d.pending}</td>
                          <td className="px-4 py-3.5 text-center">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              rate === null ? 'bg-gray-100 text-gray-400'
                              : rate >= 70 ? 'bg-green-100 text-green-700'
                              : rate >= 40 ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-600'
                            }`}>
                              {rate === null ? '—' : `${rate}%`}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center text-gray-500 text-xs">
                            {avgDays !== null ? `${avgDays}d` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Product timeline */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-gray-400" /> Product Design Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {productTimeline.length === 0 ? (
              <p className="text-sm text-gray-400 px-6 py-4">No assigned products yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Product</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Designer</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Assigned On</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">1st Submit</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Approved On</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Days to Submit</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Days to Approve</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tries</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-red-500 uppercase">Rejected</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {productTimeline.map(row => (
                      <tr key={row.productId} className="hover:bg-gray-50">
                        <td className="px-6 py-3.5 font-medium text-gray-900 max-w-[180px] truncate">{row.productName}</td>
                        <td className="px-4 py-3.5 text-gray-700">{row.designerName}</td>
                        <td className="px-4 py-3.5 text-center text-gray-600 text-xs">{fmt(row.assignDate)}</td>
                        <td className="px-4 py-3.5 text-center text-gray-600 text-xs">{fmt(row.firstSubmit)}</td>
                        <td className="px-4 py-3.5 text-center text-gray-600 text-xs">{fmt(row.approvedAt)}</td>
                        <td className="px-4 py-3.5 text-center">
                          {row.daysToSubmit !== null ? (
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              row.daysToSubmit <= 2 ? 'bg-green-100 text-green-700'
                              : row.daysToSubmit <= 5 ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-600'
                            }`}>{fmtDays(row.daysToSubmit)}</span>
                          ) : <span className="text-gray-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-center text-xs text-gray-500">{fmtDays(row.daysToApprove)}</td>
                        <td className="px-4 py-3.5 text-center text-gray-700">{row.totalSubmissions || '—'}</td>
                        <td className="px-4 py-3.5 text-center">
                          {row.rejected > 0 ? (
                            <span className="text-xs font-semibold text-red-500">{row.rejected}</span>
                          ) : <span className="text-gray-300 text-xs">0</span>}
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          {row.approvedAt ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                              <CheckCircle2 className="h-3 w-3" /> Done
                            </span>
                          ) : row.pending > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                              <Clock className="h-3 w-3" /> In Review
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">
                              <XCircle className="h-3 w-3" /> Not Started
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Assignment Log */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-gray-400" /> Assignment Log
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            {assignmentReport.length === 0 ? (
              <p className="text-sm text-gray-400 px-6 py-4">No assignments yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Product</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Assigned To</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Assigned By</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Assigned On</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Completed On</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {assignmentReport.map(row => (
                      <tr key={row.productId} className="hover:bg-gray-50">
                        <td className="px-6 py-3.5 font-medium text-gray-900 max-w-[200px] truncate">{row.productName}</td>
                        <td className="px-4 py-3.5 text-gray-700">{row.assignedTo}</td>
                        <td className="px-4 py-3.5 text-gray-500">{row.assignedBy}</td>
                        <td className="px-4 py-3.5 text-center text-gray-600 text-xs">{fmt(row.assignedOn)}</td>
                        <td className="px-4 py-3.5 text-center text-gray-600 text-xs">{fmt(row.completedOn)}</td>
                        <td className="px-4 py-3.5 text-center">
                          {row.isCompleted ? (
                            <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                              <CheckCircle2 className="h-3 w-3" /> Completed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                              <Clock className="h-3 w-3" /> In Progress
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent submissions feed */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Submissions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentSubs.length === 0 ? (
              <p className="text-sm text-gray-400">No submissions yet.</p>
            ) : recentSubs.map(sub => {
              const submitter = one(sub.submitter) as { id: string; full_name: string } | null
              const product = one(sub.product) as { id: string; name: string } | null
              return (
                <div key={sub.id} className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{product?.name || 'Product'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      by <span className="font-medium">{submitter?.full_name || 'Designer'}</span>
                      {' · '}{fmt(sub.created_at)}
                    </p>
                    {sub.feedback && sub.status === 'rejected' && (
                      <p className="text-xs text-red-500 mt-0.5 truncate">"{sub.feedback}"</p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {sub.status === 'approved' && (
                      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        <CheckCircle2 className="h-3 w-3" /> Approved
                      </span>
                    )}
                    {sub.status === 'rejected' && (
                      <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
                        <XCircle className="h-3 w-3" /> Rejected
                      </span>
                    )}
                    {sub.status === 'pending' && (
                      <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">
                        <Clock className="h-3 w-3" /> Pending
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}

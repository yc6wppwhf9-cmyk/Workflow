import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Package, TrendingUp, Clock, CheckCircle2, ArrowRight, Send, XCircle, UserCheck, AlertCircle, PlusCircle } from 'lucide-react'
import Link from 'next/link'
import { STAGE_LABELS, STAGE_COLORS, type WorkflowStage, type UserRole } from '@/lib/types'
import { formatDateTime } from '@/lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function one<T>(v: T | T[] | null | undefined): T | null { return Array.isArray(v) ? (v[0] ?? null) : (v ?? null) }

function StageBadge({ stage }: { stage: string }) {
  const color = STAGE_COLORS[stage as WorkflowStage] || 'bg-gray-100 text-gray-600'
  const label = STAGE_LABELS[stage as WorkflowStage] || stage
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>{label}</span>
}

function KpiCard({ label, value, sub, icon: Icon, color, href, active }: {
  label: string; value: string | number; sub?: string; icon: React.ElementType; color: string; href?: string; active?: boolean
}) {
  const inner = (
    <Card className={active ? 'ring-2 ring-blue-500 shadow-md' : href ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 mb-1">{label}</p>
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
          </div>
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${color}`}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
  if (href) return <Link href={href}>{inner}</Link>
  return inner
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f: filter } = await searchParams
  const show = (key: string) => !filter || filter === key
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user!.id).single()
  const role: UserRole = profile?.role || 'viewer'
  const userId = user!.id

  // ─────────────────────────────────────────────────────────────────────────────
  // SALES DASHBOARD
  // ─────────────────────────────────────────────────────────────────────────────
  if (role === 'sales') {
    const [
      { data: myProducts },
      { data: recentLogs },
    ] = await Promise.all([
      supabase.from('products')
        .select('id, name, sku, workflow_stage, created_at, sales_data(is_completed, assign_to, deadline_date, product_specification)')
        .eq('created_by', userId)
        .order('created_at', { ascending: false }),
      supabase.from('activity_logs')
        .select('*, user:profiles(full_name), product:products(name)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(6),
    ])

    const allMine = myProducts || []
    const needsInput   = allMine.filter(p => p.workflow_stage === 'draft')
    const inPipeline   = allMine.filter(p => p.workflow_stage !== 'draft' && p.workflow_stage !== 'product_live')
    const live         = allMine.filter(p => p.workflow_stage === 'product_live')

    return (
      <div>
        <Header title={`Welcome, ${profile?.full_name?.split(' ')[0] || 'Sales'}`} subtitle="Your products and requirements" />
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="My Products"  value={allMine.length}    icon={Package}      color="bg-blue-50 [&>svg]:text-blue-600"   href="?f=all"      active={filter === 'all'} />
            <KpiCard label="Needs Input"  value={needsInput.length} sub="draft stage"   icon={AlertCircle}  color="bg-amber-50 [&>svg]:text-amber-500"  href="?f=needs-input"  active={filter === 'needs-input'} />
            <KpiCard label="In Pipeline"  value={inPipeline.length} sub="past sales stage" icon={Clock}    color="bg-purple-50 [&>svg]:text-purple-600" href="?f=in-pipeline"  active={filter === 'in-pipeline'} />
            <KpiCard label="Live"         value={live.length}       icon={CheckCircle2} color="bg-green-50 [&>svg]:text-green-600"  href="?f=live"     active={filter === 'live'} />
          </div>

          {show('needs-input') && needsInput.length > 0 && (
            <Card className="border-amber-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-amber-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> Needs Your Input
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Assigned To</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Deadline</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {needsInput.map(p => {
                      const sd = one(p.sales_data) as { assign_to?: string | null; deadline_date?: string | null } | null
                      return (
                        <tr key={p.id} className="hover:bg-amber-50">
                          <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{sd?.assign_to || '—'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{sd?.deadline_date ? new Date(sd.deadline_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/products/${p.id}?tab=sales`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">
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

          {show('all') && <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base">All My Products</CardTitle>
              <Link href="/products" className="text-sm text-blue-600 hover:underline flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></Link>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Stage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {allMine.slice(0, 8).map(p => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3"><Link href={`/products/${p.id}`} className="font-medium text-gray-900 hover:text-blue-600">{p.name}</Link></td>
                      <td className="px-4 py-3"><StageBadge stage={p.workflow_stage} /></td>
                    </tr>
                  ))}
                  {allMine.length === 0 && (
                    <tr><td colSpan={2} className="text-center py-8 text-sm text-gray-400">
                      No products yet. <Link href="/products" className="text-blue-600 hover:underline">Create one</Link>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>}

          {show('in-pipeline') && inPipeline.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">In Pipeline</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                    <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Stage</th>
                    <th className="px-4 py-2"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {inPipeline.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                        <td className="px-4 py-3"><StageBadge stage={p.workflow_stage} /></td>
                        <td className="px-4 py-3 text-right"><Link href={`/products/${p.id}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">Open <ArrowRight className="h-3 w-3" /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {show('live') && live.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base text-green-700">Live Products</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                    <th className="px-4 py-2"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {live.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                        <td className="px-4 py-3 text-right"><Link href={`/products/${p.id}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">Open <ArrowRight className="h-3 w-3" /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {show('all') && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">My Recent Activity</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {(recentLogs || []).map(log => {
                  const product = one(log.product) as { name?: string } | null
                  return (
                    <div key={log.id} className="flex items-start gap-3">
                      <div className="h-2 w-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
                      <div>
                        <p className="text-sm text-gray-900">{log.action}{product?.name && <span className="text-gray-500"> · {product.name}</span>}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(log.created_at)}</p>
                      </div>
                    </div>
                  )
                })}
                {(recentLogs || []).length === 0 && <p className="text-sm text-gray-400 text-center py-2">No activity yet.</p>}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DESIGN TEAM MEMBER DASHBOARD
  // ─────────────────────────────────────────────────────────────────────────────
  if (role === 'design') {
    const [
      { data: myAssignments },
      { data: mySubmissions },
      { data: myFiles },
    ] = await Promise.all([
      supabase.from('design_data')
        .select('product_id, is_completed, product:products(id, name, workflow_stage, created_at)')
        .eq('assigned_to', userId),
      supabase.from('design_submissions')
        .select('product_id, status, created_at, feedback, reviewed_at')
        .eq('submitted_by', userId)
        .order('created_at', { ascending: false }),
      supabase.from('product_files')
        .select('product_id', { count: 'exact', head: false })
        .eq('uploaded_by', userId)
        .eq('department', 'design')
        .like('file_type', 'image/%'),
    ])

    type MySubRow = NonNullable<typeof mySubmissions>[number]
    // Latest submission per product
    const latestSubByProduct: Record<string, MySubRow> = {}
    for (const sub of mySubmissions || []) {
      if (!latestSubByProduct[sub.product_id]) latestSubByProduct[sub.product_id] = sub
    }

    const imagesByProduct: Record<string, number> = {}
    for (const f of myFiles || []) {
      imagesByProduct[f.product_id] = (imagesByProduct[f.product_id] || 0) + 1
    }

    const assignments = (myAssignments || []).map(a => ({
      ...a,
      product: one(a.product) as { id: string; name: string; workflow_stage: string; created_at: string } | null,
      latestSub: latestSubByProduct[a.product_id] ?? null,
      imagesUploaded: imagesByProduct[a.product_id] ?? 0,
    }))

    const allSubs = mySubmissions || []
    const totalSubs = allSubs.length
    const approvedSubs = allSubs.filter(s => s.status === 'approved').length
    const rejectedSubs = allSubs.filter(s => s.status === 'rejected').length
    const approvalRate = totalSubs > 0 ? Math.round((approvedSubs / totalSubs) * 100) : 0

    const pendingReview = assignments.filter(a => a.latestSub?.status === 'pending').length
    const needsWork = assignments.filter(a => !a.latestSub || a.latestSub.status === 'rejected').length

    return (
      <div>
        <Header title={`My Work, ${profile?.full_name?.split(' ')[0] || 'Designer'}`} subtitle="Design assignments and submission status" />
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Assigned to Me" value={assignments.length} icon={UserCheck} color="bg-violet-50 [&>svg]:text-violet-600" href="?f=all"        active={filter === 'all'} />
            <KpiCard label="Needs Work"     value={needsWork}          sub="not yet submitted" icon={AlertCircle} color="bg-amber-50 [&>svg]:text-amber-500" href="?f=needs-work"  active={filter === 'needs-work'} />
            <KpiCard label="In Review"      value={pendingReview}      sub="awaiting head" icon={Clock}      color="bg-blue-50 [&>svg]:text-blue-600"  href="?f=in-review"  active={filter === 'in-review'} />
            <KpiCard label="Approval Rate"  value={`${approvalRate}%`} sub={`${approvedSubs}/${totalSubs} submissions`} icon={TrendingUp} color="bg-green-50 [&>svg]:text-green-600" />
          </div>

          {show('all') && <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">My Assigned Products</CardTitle></CardHeader>
            <CardContent className="p-0">
              {assignments.length === 0 ? (
                <p className="text-sm text-gray-400 px-6 py-6 text-center">No products assigned to you yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Images</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Submissions</th>
                      <th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Status</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {assignments.map(a => {
                      const sub = a.latestSub
                      const subCount = (mySubmissions || []).filter(s => s.product_id === a.product_id).length
                      const rejCount = (mySubmissions || []).filter(s => s.product_id === a.product_id && s.status === 'rejected').length
                      return (
                        <tr key={a.product_id} className="hover:bg-gray-50">
                          <td className="px-6 py-3 font-medium text-gray-900">{a.product?.name || a.product_id}</td>
                          <td className="px-4 py-3 text-center text-gray-600">{a.imagesUploaded}</td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-gray-700">{subCount}</span>
                            {rejCount > 0 && <span className="text-red-400 text-xs ml-1">({rejCount} rej.)</span>}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {!sub ? (
                              <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Not started</span>
                            ) : sub.status === 'pending' ? (
                              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full flex items-center gap-1 justify-center w-fit mx-auto"><Clock className="h-3 w-3" />In review</span>
                            ) : sub.status === 'approved' ? (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1 justify-center w-fit mx-auto"><CheckCircle2 className="h-3 w-3" />Approved</span>
                            ) : (
                              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full flex items-center gap-1 justify-center w-fit mx-auto"><XCircle className="h-3 w-3" />Rejected</span>
                            )}
                            {sub?.status === 'rejected' && sub.feedback && (
                              <p className="text-xs text-red-400 mt-0.5 truncate max-w-[160px]">{sub.feedback}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/products/${a.product?.id || a.product_id}?tab=design`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">
                              Open <ArrowRight className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>}

          {show('needs-work') && (
            <Card className="border-amber-200">
              <CardHeader className="pb-3"><CardTitle className="text-sm text-amber-700 flex items-center gap-2"><AlertCircle className="h-4 w-4" /> Needs Work</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 bg-gray-50"><th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th><th className="text-center px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Status</th><th className="px-4 py-2"></th></tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {assignments.filter(a => !a.latestSub || a.latestSub.status === 'rejected').map(a => (
                      <tr key={a.product_id} className="hover:bg-amber-50">
                        <td className="px-6 py-3 font-medium text-gray-900">{a.product?.name || a.product_id}</td>
                        <td className="px-4 py-3 text-center">{!a.latestSub ? <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Not started</span> : <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Rejected</span>}</td>
                        <td className="px-4 py-3 text-right"><Link href={`/products/${a.product?.id || a.product_id}?tab=design`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">Open <ArrowRight className="h-3 w-3" /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {show('in-review') && (
            <Card className="border-blue-200">
              <CardHeader className="pb-3"><CardTitle className="text-sm text-blue-700 flex items-center gap-2"><Clock className="h-4 w-4" /> In Review</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-gray-100 bg-gray-50"><th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th><th className="px-4 py-2"></th></tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {assignments.filter(a => a.latestSub?.status === 'pending').map(a => (
                      <tr key={a.product_id} className="hover:bg-blue-50">
                        <td className="px-6 py-3 font-medium text-gray-900">{a.product?.name || a.product_id}</td>
                        <td className="px-4 py-3 text-right"><Link href={`/products/${a.product?.id || a.product_id}?tab=design`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">Open <ArrowRight className="h-3 w-3" /></Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DESIGN HEAD DASHBOARD
  // ─────────────────────────────────────────────────────────────────────────────
  if (role === 'design_head') {
    const [
      { data: pendingSubmissions },
      { data: productsInDesign },
      { data: designDataForProducts },
    ] = await Promise.all([
      supabase.from('design_submissions')
        .select('id, product_id, created_at, submitter:profiles!submitted_by(full_name), product:products(id, name)')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase.from('products')
        .select('id, name, created_at, workflow_stage')
        .in('workflow_stage', ['draft', 'design_completed'])
        .order('created_at', { ascending: false }),
      supabase.from('design_data')
        .select('product_id, assigned_to, assignee:profiles!assigned_to(full_name)'),
    ])

    const assignMap: Record<string, string | null> = {}
    for (const d of designDataForProducts || []) {
      const assignee = one(d.assignee) as { full_name: string } | null
      assignMap[d.product_id] = assignee?.full_name || null
    }

    const unassigned = (productsInDesign || []).filter(p => !assignMap[p.id] || assignMap[p.id] === null)
    const assigned = (productsInDesign || []).filter(p => assignMap[p.id])
    const pending = (pendingSubmissions || [])

    return (
      <div>
        <Header title={`Design Head Dashboard`} subtitle={`Welcome, ${profile?.full_name?.split(' ')[0]}`} />
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Pending Reviews" value={pending.length}   sub="awaiting your approval" icon={Send}       color="bg-amber-50 [&>svg]:text-amber-500"  href="?f=pending"    active={filter === 'pending'} />
            <KpiCard label="Unassigned"      value={unassigned.length} sub="need a designer"        icon={AlertCircle} color="bg-red-50 [&>svg]:text-red-500"    href="?f=unassigned" active={filter === 'unassigned'} />
            <KpiCard label="In Progress"     value={assigned.length}   sub="assigned & active"      icon={Clock}       color="bg-blue-50 [&>svg]:text-blue-600"   href="?f=active"     active={filter === 'active'} />
            <KpiCard label="Total Active"    value={(productsInDesign || []).length} sub="draft + design stage" icon={Package} color="bg-purple-50 [&>svg]:text-purple-600" href="?f=all" active={filter === 'all'} />
          </div>

          {show('pending') && pending.length > 0 && (
            <Card className="border-amber-200">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <CardTitle className="text-sm text-amber-700 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Pending Reviews — Oldest First
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {pending.map(sub => {
                  const submitter = one(sub.submitter) as { full_name: string } | null
                  const product = one(sub.product) as { id: string; name: string } | null
                  const waitDays = Math.floor((Date.now() - new Date(sub.created_at).getTime()) / 86400000)
                  return (
                    <div key={sub.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{product?.name}</p>
                        <p className="text-xs text-gray-500">by {submitter?.full_name} · {waitDays === 0 ? 'today' : `${waitDays}d ago`}</p>
                      </div>
                      <Link href={`/products/${product?.id}?tab=design`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 shrink-0">
                        Review <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          )}

          {show('unassigned') && unassigned.length > 0 && (
            <Card className="border-red-100">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-red-600 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> Unassigned Products
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {unassigned.map(p => (
                  <div key={p.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${p.workflow_stage === 'draft' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-600'}`}>
                        {p.workflow_stage === 'draft' ? 'From Sales' : 'Design Stage'}
                      </span>
                    </div>
                    <Link href={`/products/${p.id}?tab=design`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                      Assign <ArrowRight className="h-3 w-3" />
                    </Link>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex gap-4">
            <Link href="/management" className="flex items-center gap-2 text-sm text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 hover:bg-violet-100 transition-colors">
              <TrendingUp className="h-4 w-4" /> Open Management Dashboard
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MERCHANDISING / BOM / MARKETING DASHBOARDS
  // ─────────────────────────────────────────────────────────────────────────────
  const deptConfig: Record<string, { stage: WorkflowStage; dataTable: string; label: string; tab: string; color: string }> = {
    merchandising: { stage: 'design_completed',        dataTable: 'merchandising_data', label: 'Merchandising', tab: 'merchandising', color: 'bg-blue-50 [&>svg]:text-blue-600' },
    bom:           { stage: 'merchandising_completed', dataTable: 'bom_data',           label: 'BOM',           tab: 'bom',           color: 'bg-orange-50 [&>svg]:text-orange-600' },
    marketing:     { stage: 'bom_finalized',           dataTable: 'marketing_data',     label: 'Marketing',     tab: 'marketing',     color: 'bg-yellow-50 [&>svg]:text-yellow-600' },
  }
  const deptCfg = deptConfig[role]

  if (deptCfg) {
    const [
      { data: myWorkProducts },
      { data: recentLogs },
    ] = await Promise.all([
      supabase.from('products')
        .select(`id, name, workflow_stage, created_at, dept_data:${deptCfg.dataTable}(is_completed, updated_at)`)
        .eq('workflow_stage', deptCfg.stage)
        .order('created_at', { ascending: false }),
      supabase.from('activity_logs')
        .select('*, user:profiles(full_name), product:products(name)')
        .eq('department', role)
        .order('created_at', { ascending: false })
        .limit(6),
    ])

    type DeptProduct = { id: string; name: string; workflow_stage: string; created_at: string; dept_data: { is_completed: boolean; updated_at: string }[] | null }
    const rawProducts = myWorkProducts as unknown as DeptProduct[] | null
    const products = (rawProducts || []).map(p => ({
      ...p,
      dept: one(p.dept_data) as { is_completed: boolean; updated_at: string } | null,
    }))
    const pending   = products.filter(p => !p.dept?.is_completed)
    const completed = products.filter(p => p.dept?.is_completed)

    return (
      <div>
        <Header title={`${deptCfg.label} Dashboard`} subtitle={`Welcome, ${profile?.full_name?.split(' ')[0]}`} />
        <div className="p-6 space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <KpiCard label="Waiting for Me"   value={pending.length}   sub="ready to work on" icon={AlertCircle}  color="bg-amber-50 [&>svg]:text-amber-500" href="?f=pending"   active={filter === 'pending'} />
            <KpiCard label="Completed"         value={completed.length} icon={CheckCircle2}    color="bg-green-50 [&>svg]:text-green-600"                      href="?f=completed" active={filter === 'completed'} />
            <KpiCard label="Total in My Stage" value={products.length}  icon={Package}         color={deptCfg.color}                                           href="?f=all"       active={filter === 'all'} />
          </div>

          {show('pending') && pending.length > 0 && (
            <Card className="border-amber-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm text-amber-700 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" /> Products Waiting for {deptCfg.label}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-400 uppercase">Arrived</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pending.map(p => {
                      const days = Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000)
                      return (
                        <tr key={p.id} className="hover:bg-amber-50">
                          <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                          <td className="px-4 py-3 text-xs text-gray-500">{days === 0 ? 'Today' : `${days}d ago`}</td>
                          <td className="px-4 py-3 text-right">
                            <Link href={`/products/${p.id}?tab=${deptCfg.tab}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">
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

          {show('completed') && completed.length > 0 && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" />Recently Completed</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-6 py-2 text-xs font-semibold text-gray-400 uppercase">Product</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {completed.slice(0, 5).map(p => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-gray-900">{p.name}</td>
                        <td className="px-4 py-3 text-right">
                          <Link href={`/products/${p.id}?tab=${deptCfg.tab}`} className="text-xs text-blue-600 hover:underline flex items-center gap-1 justify-end">
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
                const user = one(log.user) as { full_name?: string } | null
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

  // ─────────────────────────────────────────────────────────────────────────────
  // ADMIN / VIEWER DASHBOARD (original full pipeline view)
  // ─────────────────────────────────────────────────────────────────────────────
  const [
    { count: totalProducts },
    { count: liveProducts },
    { count: inProgressProducts },
    { data: recentProducts },
    { data: recentLogs },
    { count: designComplete },
    { count: merchComplete },
    { count: bomComplete },
    { count: marketingComplete },
    { count: salesComplete },
  ] = await Promise.all([
    supabase.from('products').select('*', { count: 'exact', head: true }),
    supabase.from('products').select('*', { count: 'exact', head: true }).eq('workflow_stage', 'product_live'),
    supabase.from('products').select('*', { count: 'exact', head: true }).not('workflow_stage', 'in', '(draft,product_live)'),
    supabase.from('products').select('id, name, sku, workflow_stage, created_at, bom_data(fg_inv_code)').order('created_at', { ascending: false }).limit(6),
    supabase.from('activity_logs').select('*, user:profiles(full_name), product:products(name, sku)').order('created_at', { ascending: false }).limit(8),
    supabase.from('design_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
    supabase.from('merchandising_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
    supabase.from('bom_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
    supabase.from('marketing_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
    supabase.from('sales_data').select('*', { count: 'exact', head: true }).eq('is_completed', true),
  ])

  const total = totalProducts || 0
  const deptTotal = total * 5
  const deptDone = (designComplete || 0) + (merchComplete || 0) + (bomComplete || 0) + (marketingComplete || 0) + (salesComplete || 0)
  const deptRate = deptTotal > 0 ? Math.round((deptDone / deptTotal) * 100) : 0

  return (
    <div>
      <Header title="Dashboard" subtitle="Full pipeline overview" />
      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total Products" value={total} icon={Package} color="bg-blue-50 [&>svg]:text-blue-600" />
          <KpiCard label="Live Products" value={liveProducts || 0} icon={CheckCircle2} color="bg-green-50 [&>svg]:text-green-600" />
          <KpiCard label="In Progress" value={inProgressProducts || 0} sub="Active pipeline" icon={Clock} color="bg-amber-50 [&>svg]:text-amber-500" />
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent Products</CardTitle>
            <Link href="/products" className="text-sm text-blue-600 hover:underline flex items-center gap-1">View all <ArrowRight className="h-3 w-3" /></Link>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Product Name</th>
                  <th className="text-center pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">Stage</th>
                  <th className="text-right pb-2 text-xs font-semibold text-gray-400 uppercase tracking-wide">FG INV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentProducts?.map((p) => {
                  const bom = one(p.bom_data) as { fg_inv_code?: string | null } | null
                  return (
                    <tr key={p.id} className="group hover:bg-gray-50">
                      <td className="py-3"><Link href={`/products/${p.id}`} className="font-medium text-gray-900 group-hover:text-blue-600">{p.name || p.sku}</Link></td>
                      <td className="py-3 text-center"><StageBadge stage={p.workflow_stage} /></td>
                      <td className="py-3 text-right">
                        {bom?.fg_inv_code ? <span className="text-xs font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{bom.fg_inv_code}</span> : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                    </tr>
                  )
                })}
                {(!recentProducts || recentProducts.length === 0) && (
                  <tr><td colSpan={3} className="text-center py-6 text-sm text-gray-400">
                    No products yet. <Link href="/products" className="text-blue-600 hover:underline">Create one</Link>
                  </td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Recent Activity</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentLogs?.map((log) => {
                const user = one(log.user) as { full_name?: string } | null
                const product = one(log.product) as { name?: string; sku?: string } | null
                const productLabel = product?.name || product?.sku || ''
                return (
                  <div key={log.id} className="flex items-start gap-3">
                    <div className="h-2 w-2 rounded-full bg-blue-500 mt-2 shrink-0" />
                    <div>
                      <p className="text-sm text-gray-900">
                        <span className="font-medium">{user?.full_name || 'System'}</span>{' '}{log.action}
                        {productLabel && <span className="text-gray-500"> · {productLabel}</span>}
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

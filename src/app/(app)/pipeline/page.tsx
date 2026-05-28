import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CheckCircle2, Clock, Minus, GitBranch } from 'lucide-react'
import { STAGE_LABELS } from '@/lib/types'

function fmt(d: string | null) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

function diffDays(from: string | null, to: string | null): number | null {
  if (!from || !to) return null
  const ms = new Date(to).getTime() - new Date(from).getTime()
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)))
}

type StageStatus = 'done' | 'active' | 'pending'

function StageCell({
  status,
  person,
  assignedBy,
  startDate,
  endDate,
  extra,
}: {
  status: StageStatus
  person?: string | null
  assignedBy?: string | null
  startDate?: string | null
  endDate?: string | null
  extra?: string | null
}) {
  if (status === 'pending') {
    return (
      <div className="flex items-center gap-1.5 text-gray-300">
        <Minus className="h-3.5 w-3.5 shrink-0" />
        <span className="text-xs">—</span>
      </div>
    )
  }

  return (
    <div className="space-y-0.5 min-w-[130px]">
      <div className="flex items-center gap-1.5">
        {status === 'done'
          ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
          : <Clock className="h-3.5 w-3.5 text-yellow-500 shrink-0 animate-pulse" />}
        {person && <span className="text-xs font-semibold text-gray-800 truncate max-w-[110px]">{person}</span>}
      </div>
      {assignedBy && (
        <p className="text-xs text-gray-400 pl-5">by {assignedBy}</p>
      )}
      {startDate && (
        <p className="text-xs text-gray-500 pl-5">
          {fmt(startDate)}
          {endDate
            ? <> → <span className="text-green-600 font-medium">{fmt(endDate)}</span></>
            : status === 'active'
              ? <span className="text-yellow-600"> (ongoing)</span>
              : null}
        </p>
      )}
      {extra && <p className="text-xs text-gray-400 pl-5">{extra}</p>}
    </div>
  )
}

export default async function PipelinePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  if (!['admin', 'management'].includes(profile?.role ?? '')) redirect('/dashboard')

  const [
    { data: products },
    { data: designRows },
    { data: designSubmissions },
    { data: samplingRows },
    { data: merchandisingRows },
    { data: bomRows },
    { data: activityLogs },
    { data: allProfiles },
  ] = await Promise.all([
    supabase.from('products')
      .select('id, name, workflow_stage, created_at, created_by')
      .order('created_at', { ascending: false }),
    supabase.from('design_data').select('product_id, assigned_to'),
    supabase.from('design_submissions')
      .select('product_id, submitted_by, status, created_at, reviewed_at')
      .order('created_at', { ascending: true }),
    supabase.from('sampling_data').select('product_id, sampler_name, reviewed_at, is_completed'),
    supabase.from('merchandising_data').select('product_id, assigned_to, is_completed'),
    supabase.from('bom_data').select('product_id, is_completed'),
    supabase.from('activity_logs')
      .select('product_id, created_at, action, user_id')
      .order('created_at', { ascending: true }),
    supabase.from('profiles').select('id, full_name'),
  ])

  // ── Lookup maps ────────────────────────────────────────────────────────────
  const profileMap = new Map<string, string>()
  for (const p of allProfiles || []) profileMap.set(p.id, p.full_name)

  const designMap = new Map<string, string | null>()
  for (const d of designRows || []) designMap.set(d.product_id, d.assigned_to)

  const samplingMap = new Map<string, typeof samplingRows extends (infer T)[] | null ? T : never>()
  for (const s of samplingRows || []) samplingMap.set(s.product_id, s)

  const merchMap = new Map<string, typeof merchandisingRows extends (infer T)[] | null ? T : never>()
  for (const m of merchandisingRows || []) merchMap.set(m.product_id, m)

  const bomMap = new Map<string, boolean>()
  for (const b of bomRows || []) bomMap.set(b.product_id, b.is_completed)

  // ── Activity log lookups (first occurrence per product per action type) ────
  type LogEntry = { created_at: string; user_id: string | null }
  const designAssignLog   = new Map<string, LogEntry>()
  const designDoneLog     = new Map<string, LogEntry>()
  const samplingSubmitLog = new Map<string, LogEntry>()
  const samplingMgmtLog   = new Map<string, LogEntry>()
  const samplingDoneLog   = new Map<string, LogEntry>()
  const merchAssignLog    = new Map<string, LogEntry>()
  const merchSubmitLog    = new Map<string, LogEntry>()
  const merchDoneLog      = new Map<string, LogEntry>()
  const bomDoneLog        = new Map<string, LogEntry>()

  for (const log of activityLogs || []) {
    const pid = log.product_id
    if (!pid) continue
    const a = log.action?.toLowerCase() || ''
    const entry: LogEntry = { created_at: log.created_at, user_id: log.user_id }

    if (a.startsWith('assigned design to') && !designAssignLog.has(pid))       designAssignLog.set(pid, entry)
    if (a.includes('marked design complete') && !designDoneLog.has(pid))       designDoneLog.set(pid, entry)
    if (a.includes('marked sample complete') && !samplingSubmitLog.has(pid))   samplingSubmitLog.set(pid, entry)
    if (a.includes('management approved sample') && !samplingMgmtLog.has(pid)) samplingMgmtLog.set(pid, entry)
    if (a.includes('sampling complete') && a.includes('stage advanced') && !samplingDoneLog.has(pid)) samplingDoneLog.set(pid, entry)
    if (a.startsWith('assigned merchandising') && !merchAssignLog.has(pid))    merchAssignLog.set(pid, entry)
    if (a.includes('submitted attribute sheet') && !merchSubmitLog.has(pid))   merchSubmitLog.set(pid, entry)
    if (a.includes('marked merchandising complete') && !merchDoneLog.has(pid)) merchDoneLog.set(pid, entry)
    if (a.includes('marked bom complete') && !bomDoneLog.has(pid))             bomDoneLog.set(pid, entry)
  }

  // ── Design submissions per product ─────────────────────────────────────────
  const dsFirstSubmit  = new Map<string, string>()
  const dsApprovedAt   = new Map<string, string>()
  for (const sub of designSubmissions || []) {
    if (!dsFirstSubmit.has(sub.product_id)) dsFirstSubmit.set(sub.product_id, sub.created_at)
    if (sub.status === 'approved' && !dsApprovedAt.has(sub.product_id)) dsApprovedAt.set(sub.product_id, sub.reviewed_at || sub.created_at)
  }

  // ── Build pipeline rows ────────────────────────────────────────────────────
  const rows = (products || []).map(product => {
    const pid = product.id
    const stage = product.workflow_stage

    const stageOrder = ['draft','design_completed','sampling_completed','merchandising_completed','bom_finalized','marketing_ready','sales_priced','product_live']
    const stageIdx = stageOrder.indexOf(stage)
    const past = (s: string) => stageIdx > stageOrder.indexOf(s)
    const at   = (s: string) => stage === s

    // Design
    const designAssignedTo    = designMap.get(pid)
    const designAssignEntry   = designAssignLog.get(pid)
    const designDoneEntry     = designDoneLog.get(pid)
    const designFirstSubmit   = dsFirstSubmit.get(pid) || null
    const designApprovedAt    = dsApprovedAt.get(pid) || null
    const designStatus: StageStatus = past('design_completed') || at('design_completed')
      ? (designDoneEntry ? 'done' : 'active')
      : (designAssignedTo || designAssignEntry ? 'active' : 'pending')

    // Sampling
    const sampling            = samplingMap.get(pid)
    const samplingSubmitEntry = samplingSubmitLog.get(pid)
    const samplingDoneEntry   = samplingDoneLog.get(pid)
    const samplingStatus: StageStatus = past('sampling_completed') || at('sampling_completed')
      ? (samplingDoneEntry ? 'done' : 'active')
      : (samplingSubmitEntry ? 'active' : 'pending')

    // Merchandising
    const merch             = merchMap.get(pid)
    const merchAssignEntry  = merchAssignLog.get(pid)
    const merchSubmitEntry  = merchSubmitLog.get(pid)
    const merchDoneEntry    = merchDoneLog.get(pid)
    const merchStatus: StageStatus = past('merchandising_completed') || at('merchandising_completed')
      ? (merchDoneEntry ? 'done' : 'active')
      : (merch?.assigned_to || merchAssignEntry ? 'active' : 'pending')

    // BOM
    const bomDoneEntry = bomDoneLog.get(pid)
    const bomDone = bomMap.get(pid) || false
    const bomStatus: StageStatus = past('bom_finalized') || at('bom_finalized')
      ? (bomDone || bomDoneEntry ? 'done' : 'active')
      : 'pending'

    const totalDays = diffDays(product.created_at, new Date().toISOString())

    return {
      product,
      stageIdx,
      totalDays,
      design: { status: designStatus, assignedToId: designAssignedTo, assignEntry: designAssignEntry, firstSubmit: designFirstSubmit, approvedAt: designApprovedAt, doneEntry: designDoneEntry },
      sampling: { status: samplingStatus, data: sampling, submitEntry: samplingSubmitEntry, doneEntry: samplingDoneEntry },
      merch: { status: merchStatus, data: merch, assignEntry: merchAssignEntry, submitEntry: merchSubmitEntry, doneEntry: merchDoneEntry },
      bom: { status: bomStatus, doneEntry: bomDoneEntry },
    }
  })

  const stageColor: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    design_completed: 'bg-blue-100 text-blue-700',
    sampling_completed: 'bg-purple-100 text-purple-700',
    merchandising_completed: 'bg-teal-100 text-teal-700',
    bom_finalized: 'bg-orange-100 text-orange-700',
    marketing_ready: 'bg-pink-100 text-pink-700',
    sales_priced: 'bg-indigo-100 text-indigo-700',
    product_live: 'bg-green-100 text-green-700',
  }

  return (
    <div>
      <Header title="Product Pipeline" subtitle="Full lifecycle tracking — who assigned what, when, and when it was completed" />
      <div className="p-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-gray-400" />
              All Products ({rows.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <p className="text-sm text-gray-400 px-6 py-4">No products yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100">
                      {/* Product */}
                      <th className="text-left px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase bg-gray-50 sticky left-0 z-10 min-w-[180px]">Product</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase bg-gray-50 whitespace-nowrap">Created</th>
                      {/* Design */}
                      <th colSpan={3} className="text-center px-3 py-2.5 text-xs font-semibold text-blue-600 uppercase bg-blue-50 border-l border-blue-100">Design</th>
                      {/* Sampling */}
                      <th colSpan={2} className="text-center px-3 py-2.5 text-xs font-semibold text-purple-600 uppercase bg-purple-50 border-l border-purple-100">Sampling</th>
                      {/* Merchandising */}
                      <th colSpan={3} className="text-center px-3 py-2.5 text-xs font-semibold text-teal-600 uppercase bg-teal-50 border-l border-teal-100">Merchandising</th>
                      {/* BOM */}
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-orange-600 uppercase bg-orange-50 border-l border-orange-100">BOM</th>
                      {/* Stage / Days */}
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase bg-gray-50 whitespace-nowrap">Stage</th>
                      <th className="text-center px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase bg-gray-50">Days</th>
                    </tr>
                    <tr className="border-b-2 border-gray-200 text-xs text-gray-400 font-medium">
                      <th className="px-5 py-2 bg-gray-50 sticky left-0 z-10" />
                      <th className="px-3 py-2 bg-gray-50" />
                      {/* Design sub-headers */}
                      <th className="px-3 py-2 bg-blue-50 border-l border-blue-100 font-medium whitespace-nowrap text-left">Assigned To / By</th>
                      <th className="px-3 py-2 bg-blue-50 font-medium whitespace-nowrap text-left">1st Submit</th>
                      <th className="px-3 py-2 bg-blue-50 font-medium whitespace-nowrap text-left">Approved / Done</th>
                      {/* Sampling sub-headers */}
                      <th className="px-3 py-2 bg-purple-50 border-l border-purple-100 font-medium whitespace-nowrap text-left">Sampler / Submitted</th>
                      <th className="px-3 py-2 bg-purple-50 font-medium whitespace-nowrap text-left">Mgmt Approved / Done</th>
                      {/* Merch sub-headers */}
                      <th className="px-3 py-2 bg-teal-50 border-l border-teal-100 font-medium whitespace-nowrap text-left">Assigned To / By</th>
                      <th className="px-3 py-2 bg-teal-50 font-medium whitespace-nowrap text-left">Submitted</th>
                      <th className="px-3 py-2 bg-teal-50 font-medium whitespace-nowrap text-left">Completed</th>
                      {/* BOM */}
                      <th className="px-3 py-2 bg-orange-50 border-l border-orange-100 font-medium whitespace-nowrap text-left">Completed</th>
                      <th className="px-3 py-2 bg-gray-50" />
                      <th className="px-3 py-2 bg-gray-50" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map(({ product, totalDays, design, sampling, merch, bom }) => (
                      <tr key={product.id} className="hover:bg-gray-50 align-top">
                        {/* Product name */}
                        <td className="px-5 py-3 sticky left-0 bg-white border-r border-gray-100 z-10">
                          <Link href={`/products/${product.id}`} className="font-medium text-gray-900 hover:text-blue-600 text-sm line-clamp-2 block max-w-[200px]">
                            {product.name}
                          </Link>
                        </td>
                        {/* Created */}
                        <td className="px-3 py-3 text-center">
                          <p className="text-xs text-gray-600 whitespace-nowrap">{fmt(product.created_at)}</p>
                          {product.created_by && (
                            <p className="text-xs text-gray-400 mt-0.5">{profileMap.get(product.created_by) || '—'}</p>
                          )}
                        </td>

                        {/* ── Design: Assigned To / By ── */}
                        <td className="px-3 py-3 border-l border-blue-50">
                          <StageCell
                            status={design.status}
                            person={design.assignedToId ? profileMap.get(design.assignedToId) : null}
                            assignedBy={design.assignEntry?.user_id ? profileMap.get(design.assignEntry.user_id) : null}
                            startDate={design.assignEntry?.created_at || null}
                            endDate={design.doneEntry?.created_at || null}
                          />
                        </td>
                        {/* ── Design: 1st Submit ── */}
                        <td className="px-3 py-3">
                          {design.firstSubmit ? (
                            <p className="text-xs text-gray-600 whitespace-nowrap">{fmt(design.firstSubmit)}</p>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        {/* ── Design: Approved / Done ── */}
                        <td className="px-3 py-3">
                          {design.approvedAt ? (
                            <div>
                              <p className="text-xs text-green-600 font-medium whitespace-nowrap">Images: {fmt(design.approvedAt)}</p>
                              {design.doneEntry && <p className="text-xs text-green-700 font-semibold whitespace-nowrap mt-0.5">Done: {fmt(design.doneEntry.created_at)}</p>}
                            </div>
                          ) : design.doneEntry ? (
                            <p className="text-xs text-green-700 font-semibold whitespace-nowrap">Done: {fmt(design.doneEntry.created_at)}</p>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>

                        {/* ── Sampling: Sampler / Submitted ── */}
                        <td className="px-3 py-3 border-l border-purple-50">
                          <StageCell
                            status={sampling.status}
                            person={sampling.data?.sampler_name}
                            startDate={sampling.submitEntry?.created_at || null}
                            endDate={sampling.doneEntry?.created_at || null}
                          />
                        </td>
                        {/* ── Sampling: Mgmt Approved / Done ── */}
                        <td className="px-3 py-3">
                          {sampling.data?.reviewed_at ? (
                            <div>
                              <p className="text-xs text-green-600 font-medium whitespace-nowrap">Approved: {fmt(sampling.data.reviewed_at)}</p>
                              {sampling.doneEntry && <p className="text-xs text-green-700 font-semibold whitespace-nowrap mt-0.5">Done: {fmt(sampling.doneEntry.created_at)}</p>}
                            </div>
                          ) : sampling.doneEntry ? (
                            <p className="text-xs text-green-700 font-semibold">Done: {fmt(sampling.doneEntry.created_at)}</p>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>

                        {/* ── Merch: Assigned To / By ── */}
                        <td className="px-3 py-3 border-l border-teal-50">
                          <StageCell
                            status={merch.status}
                            person={merch.data?.assigned_to ? profileMap.get(merch.data.assigned_to) : null}
                            assignedBy={merch.assignEntry?.user_id ? profileMap.get(merch.assignEntry.user_id) : null}
                            startDate={merch.assignEntry?.created_at || null}
                            endDate={merch.doneEntry?.created_at || null}
                          />
                        </td>
                        {/* ── Merch: Submitted ── */}
                        <td className="px-3 py-3">
                          {merch.submitEntry ? (
                            <p className="text-xs text-gray-600 whitespace-nowrap">{fmt(merch.submitEntry.created_at)}</p>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        {/* ── Merch: Completed ── */}
                        <td className="px-3 py-3">
                          {merch.doneEntry ? (
                            <p className="text-xs text-green-700 font-semibold whitespace-nowrap">{fmt(merch.doneEntry.created_at)}</p>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>

                        {/* ── BOM: Completed ── */}
                        <td className="px-3 py-3 border-l border-orange-50">
                          {bom.doneEntry ? (
                            <p className="text-xs text-green-700 font-semibold whitespace-nowrap">{fmt(bom.doneEntry.created_at)}</p>
                          ) : bom.status === 'active' ? (
                            <span className="inline-flex items-center gap-1 text-xs text-yellow-600">
                              <Clock className="h-3 w-3 animate-pulse" /> In progress
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>

                        {/* Stage */}
                        <td className="px-3 py-3 text-center">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${stageColor[product.workflow_stage] || 'bg-gray-100 text-gray-500'}`}>
                            {STAGE_LABELS[product.workflow_stage as keyof typeof STAGE_LABELS] || product.workflow_stage}
                          </span>
                        </td>

                        {/* Total days */}
                        <td className="px-3 py-3 text-center">
                          <span className="text-xs text-gray-500">{totalDays !== null ? `${totalDays}d` : '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

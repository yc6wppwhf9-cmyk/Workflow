import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { CheckCircle2, Clock, Circle, ExternalLink, GitBranch, Download } from 'lucide-react'
import { STAGE_LABELS } from '@/lib/types'

function fmt(d: string | null | undefined) {
  if (!d) return null
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })
}

function diffDays(from: string | null, to: string | null): number | null {
  if (!from || !to) return null
  return Math.max(0, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000))
}

type MilestoneStatus = 'done' | 'active' | 'pending'

const DEPT_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  sales:         { bg: 'bg-rose-50',    border: 'border-rose-200',    text: 'text-rose-700',    dot: 'bg-rose-400' },
  design:        { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    dot: 'bg-blue-400' },
  sampling:      { bg: 'bg-purple-50',  border: 'border-purple-200',  text: 'text-purple-700',  dot: 'bg-purple-400' },
  merchandising: { bg: 'bg-teal-50',    border: 'border-teal-200',    text: 'text-teal-700',    dot: 'bg-teal-400' },
  bom:           { bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-700',  dot: 'bg-orange-400' },
  marketing:     { bg: 'bg-pink-50',    border: 'border-pink-200',    text: 'text-pink-700',    dot: 'bg-pink-400' },
}

interface Milestone {
  id: string
  dept: string
  label: string
  status: MilestoneStatus
  person?: string | null
  byPerson?: string | null   // "assigned by" (secondary person)
  date?: string | null
}

function MilestoneRow({ m, isLast }: { m: Milestone; isLast: boolean }) {
  const c = DEPT_COLORS[m.dept]
  return (
    <div className="flex gap-3">
      {/* Icon + connector line */}
      <div className="flex flex-col items-center">
        <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 z-10 ${
          m.status === 'done'   ? 'bg-green-100' :
          m.status === 'active' ? 'bg-yellow-100' : 'bg-gray-100'
        }`}>
          {m.status === 'done'   && <CheckCircle2 className="h-4 w-4 text-green-500" />}
          {m.status === 'active' && <Clock className="h-4 w-4 text-yellow-500" />}
          {m.status === 'pending' && <Circle className="h-4 w-4 text-gray-300" />}
        </div>
        {!isLast && <div className="w-px flex-1 bg-gray-200 mt-1" />}
      </div>

      {/* Content */}
      <div className="pb-4 flex-1 min-w-0">
        <p className={`text-xs font-medium leading-tight ${
          m.status === 'done' ? 'text-gray-800' :
          m.status === 'active' ? 'text-gray-900' : 'text-gray-400'
        }`}>{m.label}</p>
        {(m.person || m.byPerson) && m.status !== 'pending' && (
          <p className="text-xs text-gray-500 mt-0.5 leading-tight">
            {m.person && <span className="font-medium text-gray-700">{m.person}</span>}
            {m.byPerson && <span className="text-gray-400"> · by {m.byPerson}</span>}
          </p>
        )}
        {m.date && m.status !== 'pending' && (
          <p className="text-xs text-gray-400 mt-0.5">{fmt(m.date)}</p>
        )}
        {m.status === 'active' && !m.date && (
          <p className="text-xs text-yellow-500 mt-0.5">In progress</p>
        )}
      </div>
    </div>
  )
}

function DeptSection({ dept, title, milestones }: { dept: string; title: string; milestones: Milestone[] }) {
  const c = DEPT_COLORS[dept]
  const allDone = milestones.every(m => m.status === 'done')
  const anyActive = milestones.some(m => m.status === 'active' || m.status === 'done')
  return (
    <div className={`rounded-lg border ${c.border} ${anyActive ? c.bg : 'bg-gray-50 border-gray-100'} px-4 pt-3 pb-1`}>
      <p className={`text-xs font-semibold uppercase tracking-wider mb-3 ${anyActive ? c.text : 'text-gray-400'}`}>
        {title}
        {allDone && <span className="ml-2 text-green-600">✓</span>}
      </p>
      <div>
        {milestones.map((m, i) => (
          <MilestoneRow key={m.id} m={m} isLast={i === milestones.length - 1} />
        ))}
      </div>
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
    { data: activityLogs },
    { data: allProfiles },
  ] = await Promise.all([
    supabase.from('products')
      .select('id, name, workflow_stage, created_at, created_by')
      .order('created_at', { ascending: false }),
    supabase.from('design_data').select('product_id, assigned_to'),
    supabase.from('design_submissions')
      .select('product_id, submitted_by, status, created_at, reviewed_at, reviewed_by')
      .order('created_at', { ascending: true }),
    supabase.from('sampling_data').select('product_id, sampler_name, reviewed_at, reviewed_by'),
    supabase.from('merchandising_data').select('product_id, assigned_to, is_completed'),
    supabase.from('activity_logs')
      .select('product_id, created_at, action, user_id')
      .order('created_at', { ascending: true }),
    supabase.from('profiles').select('id, full_name'),
  ])

  // ── Lookup maps ────────────────────────────────────────────────────────────
  const profileMap = new Map<string, string>()
  for (const p of allProfiles || []) profileMap.set(p.id, p.full_name)
  const name = (id?: string | null) => (id ? profileMap.get(id) || '—' : null)

  const designMap = new Map<string, string | null>()
  for (const d of designRows || []) designMap.set(d.product_id, d.assigned_to)

  const samplingMap = new Map<string, typeof samplingRows extends (infer T)[] | null ? T : never>()
  for (const s of samplingRows || []) samplingMap.set(s.product_id, s)

  const merchMap = new Map<string, typeof merchandisingRows extends (infer T)[] | null ? T : never>()
  for (const m of merchandisingRows || []) merchMap.set(m.product_id, m)

  // ── Activity log maps: first occurrence per product per action type ────────
  type LogEntry = { created_at: string; user_id: string | null }
  type LogMap = Map<string, LogEntry>
  const L = () => new Map<string, LogEntry>() as LogMap

  const salesCreateLog    = L()
  const salesCompleteLog  = L()
  const designAssignLog   = L()
  const illUploadLog      = L()
  const illSubmitLog      = L()
  const illApproveLog     = L()
  const designCompleteLog = L()
  const sampSubmitLog     = L()
  const sampApproveLog    = L()
  const sampDoneLog       = L()
  const merchAssignLog    = L()
  const merchSubmitLog    = L()
  const merchDoneLog      = L()
  const bomDoneLog        = L()

  for (const log of activityLogs || []) {
    const pid = log.product_id
    if (!pid) continue
    const a = (log.action || '').toLowerCase()
    const e: LogEntry = { created_at: log.created_at, user_id: log.user_id }

    if (a.includes('created product with sales') && !salesCreateLog.has(pid))   salesCreateLog.set(pid, e)
    if (a.includes('marked sales complete') && !salesCompleteLog.has(pid))      salesCompleteLog.set(pid, e)
    if (a.startsWith('assigned design to') && !designAssignLog.has(pid))        designAssignLog.set(pid, e)
    if (a.startsWith('uploaded') && a.includes('illustration') && !illUploadLog.has(pid)) illUploadLog.set(pid, e)
    if (a.includes('submitted design illustrations') && !illSubmitLog.has(pid)) illSubmitLog.set(pid, e)
    if (a.includes('design submission approved') && !illApproveLog.has(pid))    illApproveLog.set(pid, e)
    if (a.includes('marked design complete') && !designCompleteLog.has(pid))    designCompleteLog.set(pid, e)
    if (a.includes('marked sample complete') && !sampSubmitLog.has(pid))        sampSubmitLog.set(pid, e)
    if (a.includes('management approved sample') && !sampApproveLog.has(pid))   sampApproveLog.set(pid, e)
    if (a.includes('sampling complete') && a.includes('stage advanced') && !sampDoneLog.has(pid)) sampDoneLog.set(pid, e)
    if (a.startsWith('assigned merchandising') && !merchAssignLog.has(pid))     merchAssignLog.set(pid, e)
    if (a.includes('submitted attribute sheet') && !merchSubmitLog.has(pid))    merchSubmitLog.set(pid, e)
    if (a.includes('marked merchandising complete') && !merchDoneLog.has(pid))  merchDoneLog.set(pid, e)
    if (a.includes('marked bom complete') && !bomDoneLog.has(pid))              bomDoneLog.set(pid, e)
  }

  // Design submissions: first submit + first approval
  const dsFirstSubmit = new Map<string, string>()
  const dsFirstApprove = new Map<string, { at: string; by: string | null }>()
  for (const sub of designSubmissions || []) {
    if (!dsFirstSubmit.has(sub.product_id)) dsFirstSubmit.set(sub.product_id, sub.created_at)
    if (sub.status === 'approved' && !dsFirstApprove.has(sub.product_id)) {
      dsFirstApprove.set(sub.product_id, { at: sub.reviewed_at || sub.created_at, by: sub.reviewed_by })
    }
  }

  // ── Build milestone list for each product ─────────────────────────────────
  const stageOrder = ['draft','design_completed','sampling_completed','merchandising_completed','bom_finalized','marketing_ready','sales_priced','product_live']

  const pipelineRows = (products || []).map(product => {
    const pid = product.id
    const si = stageOrder.indexOf(product.workflow_stage)
    const past = (s: string) => si > stageOrder.indexOf(s)
    const atOrPast = (s: string) => si >= stageOrder.indexOf(s)

    const designedTo = designMap.get(pid)
    const sampling   = samplingMap.get(pid)
    const merch      = merchMap.get(pid)
    const dsApprove  = dsFirstApprove.get(pid)

    const ms = (id: string, dept: string, label: string, opts: {
      logEntry?: LogEntry | null
      date?: string | null
      person?: string | null
      byPerson?: string | null
      doneIf: boolean
      activeIf: boolean
    }): Milestone => {
      const status: MilestoneStatus = opts.doneIf ? 'done' : opts.activeIf ? 'active' : 'pending'
      return {
        id, dept, label, status,
        date: opts.date ?? opts.logEntry?.created_at ?? null,
        person: opts.person ?? null,
        byPerson: opts.byPerson ?? null,
      }
    }

    const milestones: Milestone[] = [
      // ── SALES ──────────────────────────────────────────────────────────────
      ms('sales_created', 'sales', 'Product created by Sales', {
        logEntry: salesCreateLog.get(pid),
        person: name(salesCreateLog.get(pid)?.user_id ?? product.created_by),
        doneIf: !!salesCreateLog.has(pid) || !!product.created_by,
        activeIf: false,
      }),
      ms('sales_complete', 'sales', 'Requirements shared with Design team', {
        logEntry: salesCompleteLog.get(pid),
        person: name(salesCompleteLog.get(pid)?.user_id),
        doneIf: atOrPast('design_completed'),
        activeIf: product.workflow_stage === 'draft',
      }),
      // ── DESIGN ─────────────────────────────────────────────────────────────
      ms('design_assigned', 'design', 'Designer assigned', {
        logEntry: designAssignLog.get(pid),
        person: name(designedTo),
        byPerson: name(designAssignLog.get(pid)?.user_id),
        doneIf: !!designedTo || !!designAssignLog.has(pid),
        activeIf: atOrPast('design_completed') && !designedTo,
      }),
      ms('ill_uploaded', 'design', 'Illustrations uploaded', {
        logEntry: illUploadLog.get(pid),
        person: name(illUploadLog.get(pid)?.user_id ?? designedTo),
        doneIf: !!illUploadLog.has(pid),
        activeIf: !!designedTo && !illUploadLog.has(pid) && atOrPast('design_completed'),
      }),
      ms('ill_submitted', 'design', 'Sent to design head for review', {
        logEntry: illSubmitLog.get(pid),
        date: dsFirstSubmit.get(pid) ?? null,
        person: name(illSubmitLog.get(pid)?.user_id ?? designedTo),
        doneIf: !!dsFirstSubmit.has(pid) || !!illSubmitLog.has(pid),
        activeIf: !!illUploadLog.has(pid) && !dsFirstSubmit.has(pid),
      }),
      ms('ill_approved', 'design', 'Illustrations approved by Design Head', {
        date: dsApprove?.at ?? null,
        person: name(dsApprove?.by ?? illApproveLog.get(pid)?.user_id),
        doneIf: !!dsApprove || !!illApproveLog.has(pid),
        activeIf: !!dsFirstSubmit.has(pid) && !dsApprove,
      }),
      ms('design_done', 'design', 'Tech pack filled — Design completed', {
        logEntry: designCompleteLog.get(pid),
        person: name(designCompleteLog.get(pid)?.user_id),
        doneIf: !!designCompleteLog.has(pid) || atOrPast('sampling_completed'),
        activeIf: !!dsApprove && !designCompleteLog.has(pid),
      }),
      // ── SAMPLING ───────────────────────────────────────────────────────────
      ms('samp_started', 'sampling', 'Sampling started', {
        date: sampSubmitLog.get(pid)?.created_at ?? (atOrPast('sampling_completed') ? product.created_at : null),
        person: sampling?.sampler_name,
        doneIf: !!sampSubmitLog.has(pid) || atOrPast('merchandising_completed'),
        activeIf: atOrPast('sampling_completed') && !sampSubmitLog.has(pid),
      }),
      ms('samp_submitted', 'sampling', 'Sample sent for management approval', {
        logEntry: sampSubmitLog.get(pid),
        person: name(sampSubmitLog.get(pid)?.user_id),
        doneIf: !!sampSubmitLog.has(pid),
        activeIf: atOrPast('sampling_completed') && !sampSubmitLog.has(pid),
      }),
      ms('samp_approved', 'sampling', 'Sample approved by management', {
        logEntry: sampApproveLog.get(pid),
        person: name(sampApproveLog.get(pid)?.user_id ?? sampling?.reviewed_by),
        date: sampApproveLog.get(pid)?.created_at ?? sampling?.reviewed_at ?? null,
        doneIf: !!sampApproveLog.has(pid) || !!sampling?.reviewed_at,
        activeIf: !!sampSubmitLog.has(pid) && !sampApproveLog.has(pid),
      }),
      ms('samp_done', 'sampling', 'Sampling completed — sent to Merchandising', {
        logEntry: sampDoneLog.get(pid),
        person: name(sampDoneLog.get(pid)?.user_id),
        doneIf: !!sampDoneLog.has(pid) || atOrPast('merchandising_completed'),
        activeIf: !!sampApproveLog.has(pid) && !sampDoneLog.has(pid),
      }),
      // ── MERCHANDISING ──────────────────────────────────────────────────────
      ms('merch_assigned', 'merchandising', 'Merchandising task assigned', {
        logEntry: merchAssignLog.get(pid),
        person: name(merch?.assigned_to),
        byPerson: name(merchAssignLog.get(pid)?.user_id),
        doneIf: !!merch?.assigned_to || !!merchAssignLog.has(pid),
        activeIf: atOrPast('merchandising_completed') && !merch?.assigned_to,
      }),
      ms('merch_submitted', 'merchandising', 'Attribute sheet submitted to head', {
        logEntry: merchSubmitLog.get(pid),
        person: name(merchSubmitLog.get(pid)?.user_id),
        doneIf: !!merchSubmitLog.has(pid),
        activeIf: !!merch?.assigned_to && !merchSubmitLog.has(pid) && atOrPast('merchandising_completed'),
      }),
      ms('merch_done', 'merchandising', 'Merchandising completed — sent to BOM', {
        logEntry: merchDoneLog.get(pid),
        person: name(merchDoneLog.get(pid)?.user_id),
        doneIf: !!merchDoneLog.has(pid) || atOrPast('bom_finalized'),
        activeIf: (!!merch?.assigned_to || !!merchSubmitLog.has(pid)) && !merchDoneLog.has(pid) && atOrPast('merchandising_completed'),
      }),
      // ── BOM ────────────────────────────────────────────────────────────────
      ms('bom_done', 'bom', 'BOM completed — sent to Marketing', {
        logEntry: bomDoneLog.get(pid),
        person: name(bomDoneLog.get(pid)?.user_id),
        doneIf: !!bomDoneLog.has(pid) || atOrPast('marketing_ready'),
        activeIf: atOrPast('bom_finalized') && !bomDoneLog.has(pid),
      }),
      // ── MARKETING ──────────────────────────────────────────────────────────
      ms('marketing', 'marketing', 'Marketing stage', {
        doneIf: atOrPast('sales_priced'),
        activeIf: product.workflow_stage === 'marketing_ready',
      }),
    ]

    return { product, milestones, totalDays: diffDays(product.created_at, new Date().toISOString()) }
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

  const DEPT_SECTIONS: { dept: string; title: string; ids: string[] }[] = [
    { dept: 'sales',         title: 'Sales',         ids: ['sales_created','sales_complete'] },
    { dept: 'design',        title: 'Design',        ids: ['design_assigned','ill_uploaded','ill_submitted','ill_approved','design_done'] },
    { dept: 'sampling',      title: 'Sampling',      ids: ['samp_started','samp_submitted','samp_approved','samp_done'] },
    { dept: 'merchandising', title: 'Merchandising', ids: ['merch_assigned','merch_submitted','merch_done'] },
    { dept: 'bom',           title: 'BOM',           ids: ['bom_done'] },
    { dept: 'marketing',     title: 'Marketing',     ids: ['marketing'] },
  ]

  return (
    <div>
      <Header title="Product Pipeline" subtitle="Full lifecycle milestone tracking for every product" />

      {/* Sticky product index + export bar */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
        <div className="px-6 py-2 flex items-center gap-3 overflow-x-auto">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide shrink-0">
            {pipelineRows.length} product{pipelineRows.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2 flex-1 overflow-x-auto">
            {pipelineRows.map(({ product }) => (
              <a
                key={product.id}
                href={`#product-${product.id}`}
                className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap shrink-0 hover:opacity-80 transition-opacity ${stageColor[product.workflow_stage] || 'bg-gray-100 text-gray-500 border-gray-200'}`}
              >
                {product.name.length > 30 ? product.name.slice(0, 30) + '…' : product.name}
              </a>
            ))}
          </div>
          <a
            href="/api/export-pipeline"
            download
            className="shrink-0 flex items-center gap-1.5 text-xs font-medium bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Download className="h-3.5 w-3.5" />
            Export Excel
          </a>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {pipelineRows.length === 0 && (
          <p className="text-sm text-gray-400">No products yet.</p>
        )}

        {pipelineRows.map(({ product, milestones, totalDays }) => {
          const msMap = new Map(milestones.map(m => [m.id, m]))

          return (
            <div id={`product-${product.id}`} key={product.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden scroll-mt-14">
              {/* Product header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-gray-50">
                <div className="flex items-center gap-3 min-w-0">
                  <GitBranch className="h-4 w-4 text-gray-400 shrink-0" />
                  <Link href={`/products/${product.id}`} className="font-semibold text-gray-900 hover:text-blue-600 truncate flex items-center gap-1.5">
                    {product.name}
                    <ExternalLink className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                  </Link>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${stageColor[product.workflow_stage] || 'bg-gray-100 text-gray-500'}`}>
                    {STAGE_LABELS[product.workflow_stage as keyof typeof STAGE_LABELS] || product.workflow_stage}
                  </span>
                </div>
                <div className="text-xs text-gray-400 shrink-0 ml-4">
                  Day {totalDays ?? 0} · Started {fmt(product.created_at)}
                </div>
              </div>

              {/* Pipeline body */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-4">
                {DEPT_SECTIONS.map(({ dept, title, ids }) => {
                  const sectionMilestones = ids.map(id => msMap.get(id)).filter(Boolean) as Milestone[]
                  return (
                    <DeptSection key={dept} dept={dept} title={title} milestones={sectionMilestones} />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

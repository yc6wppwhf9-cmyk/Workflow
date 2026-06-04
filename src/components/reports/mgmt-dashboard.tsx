'use client'

import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, PieChart, Pie, Cell, ComposedChart, Line, Legend,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProductMetrics = {
  id: string
  name: string
  stage: string
  status: 'completed' | 'in_progress' | 'delayed' | 'at_risk'
  designDays: number
  samplingDays: number
  techpackDays: number
  bomDays: number
  marketingDays: number
  totalDays: number
  illustrationRounds: number
  illustrationRejections: number
  designerName: string | null
  designerId: string | null
  jrMerchName: string | null
  jrMerchId: string | null
  samplerName: string | null
  samplerId: string | null
  delayDays: number
  designCount: number
  sampleStatus: string | null
  sampleFeedback: string | null
  invId: string | null
  mktPhotoshoot: boolean
  mktCatalog: boolean
  mktLaunchCreative: boolean
  mktUpdatedBy: string | null
  bomUpdatedBy: string | null
}

export type PersonStat = {
  id: string
  name: string
  products: number
  avgDays: number
  reworks: number
  rejections: number
  onTime: number
  score: number
  accuracy?: string
}

export type BomLogRow = {
  productId: string
  productName: string
  exec: string
  days: number
  errors: number
  invId: string | null
  status: string
}

export type MktRole = {
  role: string
  products: number
  avgDays: number
  revisions: number
  onTime: number
  score: number
}

export type MktDeliverableRow = {
  productId: string
  productName: string
  photoshoot: boolean
  catalog: boolean
  launchCreative: boolean
  isCompleted: boolean
  daysInMarketing: number
  assignedTo: string | null
}

export type MgmtDashboardData = {
  products: ProductMetrics[]
  designerStats: PersonStat[]
  jrMerchStats: PersonStat[]
  samplerStats: PersonStat[]
  bomLog: BomLogRow[]
  bomExecStats: PersonStat[]
  mktRoles: MktRole[]
  mktDeliverableRows: MktDeliverableRow[]
  marketingDeliverables: { label: string; completed: number; delayed: number }[]
  sampleRejectionReasons: { reason: string; count: number }[]
  stageAvgs: { design: number; sampling: number; techpack: number; bom: number; marketing: number }
  summary: {
    total: number
    avgCycleTime: number
    onTimeCount: number
    onTrackCount: number
    delayedCount: number
    atRiskCount: number
    totalReworks: number
    avgApprovalRounds: number
  }
  heads: {
    design:    { name: string; avgReviewDays: number; rejections: number; reworks: number; firstPassRate: number }
    merch:     { name: string; avgReviewDays: number | null; rejections: number; reworks: number; firstPassRate: number }
    bom:       { name: string; approvalRate: number; avgReviewDays: number | null }
    marketing: { name: string; avgReviewDays: number | null; revisions: number; onTimeRate: number; decksSignedOff: number }
  }
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const STAGE_COLORS = {
  design:    '#AFA9EC',
  sampling:  '#5DCAA5',
  techpack:  '#F0997B',
  bom:       '#85B7EB',
  marketing: '#FAC775',
}
const TARGET_COLOR = '#E24B4A'
const PIE_COLORS = ['#AFA9EC', '#F0997B', '#5DCAA5', '#85B7EB', '#FAC775']

// ─── Small helpers ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ProductMetrics['status'] }) {
  const map = {
    completed:   'bg-green-100 text-green-700',
    in_progress: 'bg-blue-100 text-blue-700',
    delayed:     'bg-amber-100 text-amber-700',
    at_risk:     'bg-red-100 text-red-700',
  }
  const labels = { completed: 'Completed', in_progress: 'In Progress', delayed: 'Delayed', at_risk: 'At Risk' }
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${map[status]}`}>{labels[status]}</span>
}

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 90 ? 'bg-green-100 text-green-700' : score >= 75 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{score}/100</span>
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 90 ? '#5DCAA5' : score >= 75 ? '#EF9F27' : '#E24B4A'
  return (
    <div className="h-1.5 bg-gray-100 rounded-full mt-1 w-full">
      <div className="h-1.5 rounded-full" style={{ width: `${score}%`, background: color }} />
    </div>
  )
}

function MetricCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 sm:p-4">
      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">{label}</p>
      <p className="text-2xl font-medium" style={color ? { color } : {}}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

const MEDALS = ['🥇', '🥈', '🥉', '']
const AVATAR_COLORS = ['bg-teal-100 text-teal-700', 'bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700', 'bg-orange-100 text-orange-700', 'bg-pink-100 text-pink-700']

function PersonBoard({ people, daysLabel }: { people: PersonStat[]; daysLabel: string }) {
  if (people.length === 0) return <p className="text-sm text-gray-400 py-4 text-center">No assignment data yet.</p>
  return (
    <div className="space-y-3">
      {people.map((p, i) => (
        <div key={p.id} className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}>
            {p.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{MEDALS[i] ?? ''} {p.name}</span>
              <ScoreBadge score={p.score} />
            </div>
            <p className="text-xs text-gray-400">{p.products} products · Avg {p.avgDays}d {daysLabel} · {p.reworks} reworks</p>
            <ScoreBar score={p.score} />
          </div>
        </div>
      ))}
    </div>
  )
}

function HeadCard({ title, stats }: { title: string; stats: Record<string, string | number | null> }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 mb-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Object.entries(stats).map(([k, v]) => (
          <div key={k}>
            <p className="text-xs text-gray-400 mb-0.5">{k}</p>
            <p className="text-base font-semibold text-gray-800">{v ?? <span className="text-gray-300 text-sm">N/A</span>}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Tab: Overall ─────────────────────────────────────────────────────────────

function OverallTab({ data }: { data: MgmtDashboardData }) {
  const { products, summary, stageAvgs } = data

  const stageChartData = [
    { stage: 'Design',    avg: stageAvgs.design,    target: 7 },
    { stage: 'Sampling',  avg: stageAvgs.sampling,  target: 9 },
    { stage: 'Techpack',  avg: stageAvgs.techpack,  target: 3 },
    { stage: 'BOM',       avg: stageAvgs.bom,       target: 3 },
    { stage: 'Marketing', avg: stageAvgs.marketing, target: 7 },
  ]

  const reworkData = [
    { name: 'Design Illustration', value: data.products.reduce((s, p) => s + p.illustrationRejections, 0) },
    { name: 'Sample Rejection',    value: data.products.filter(p => p.sampleStatus === 'rejected').length },
    { name: 'Techpack Rework',     value: data.jrMerchStats.reduce((s, j) => s + j.reworks, 0) },
    { name: 'BOM Entry',           value: data.bomLog.filter(b => b.errors > 0).length },
  ].filter(d => d.value > 0)

  const hotspots = [
    { stage: 'Sampling & Approval', delay: Math.max(0, stageAvgs.sampling - 9), max: 3 },
    { stage: 'Design Rework Rounds', delay: Math.max(0, stageAvgs.design - 7), max: 3 },
    { stage: 'Techpack Accuracy',   delay: Math.max(0, stageAvgs.techpack - 3), max: 3 },
    { stage: 'BOM Data Entry',      delay: Math.max(0, stageAvgs.bom - 3), max: 3 },
    { stage: 'Marketing Deadlines', delay: Math.max(0, stageAvgs.marketing - 7), max: 3 },
  ]

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard label="Total Products"    value={summary.total}           sub="In PLM system" />
        <MetricCard label="Avg Cycle Time"    value={`${summary.avgCycleTime}d`} sub={summary.avgCycleTime > 0 ? `vs 30d target` : 'Not enough data'} color={summary.avgCycleTime > 32 ? '#E24B4A' : '#3B6D11'} />
        <MetricCard label="On-Time Delivery"  value={`${summary.total > 0 ? Math.round(summary.onTimeCount / summary.total * 100) : 0}%`} sub={`${summary.onTimeCount} of ${summary.total} products`} />
        <MetricCard label="Rework Instances"  value={summary.totalReworks}    sub="Across all stages"    color={summary.totalReworks > 10 ? '#A32D2D' : undefined} />
        <MetricCard label="Avg Approval Rds"  value={`${summary.avgApprovalRounds}`} sub="Per product"  color={summary.avgApprovalRounds > 2 ? '#854F0B' : undefined} />
      </div>

      {/* Status row */}
      <div className="flex gap-2 flex-wrap">
        <span className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">{summary.onTrackCount} Completed</span>
        <span className="inline-block px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">{summary.delayedCount} Delayed</span>
        <span className="inline-block px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">{summary.atRiskCount} At Risk</span>
        <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
          {summary.total - summary.onTrackCount - summary.delayedCount - summary.atRiskCount} In Progress
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Pipeline table */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Product Pipeline Status</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                <th className="text-left pb-2 text-xs font-medium text-gray-400">Product</th>
                <th className="text-left pb-2 text-xs font-medium text-gray-400">Stage</th>
                <th className="text-right pb-2 text-xs font-medium text-gray-400">Days</th>
                <th className="text-right pb-2 text-xs font-medium text-gray-400">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {products.slice(0, 12).map(p => (
                  <tr key={p.id}>
                    <td className="py-1.5 pr-3">
                      <p className="font-medium text-gray-800 text-xs truncate max-w-[120px]">{p.name}</p>
                    </td>
                    <td className="py-1.5 text-xs text-gray-500">{p.stage.replace('_completed','').replace('_finalized','').replace('_ready','').replace('_priced','')}</td>
                    <td className="py-1.5 text-right text-xs">{p.totalDays}d</td>
                    <td className="py-1.5 text-right"><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stage avg time chart */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Stage-Wise Avg Time (days)</p>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={stageChartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="stage" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 14]} />
              <Tooltip formatter={(v, n) => [`${v}d`, n === 'avg' ? 'Actual' : 'Target']} />
              <Bar dataKey="avg" name="avg" radius={[4, 4, 0, 0]}>
                {stageChartData.map((entry, i) => (
                  <Cell key={i} fill={Object.values(STAGE_COLORS)[i]} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="target" stroke={TARGET_COLOR} strokeDasharray="5 5" dot={{ r: 3, fill: TARGET_COLOR }} name="target" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Delay hotspots */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Delay Hotspots</p>
          {hotspots.map(h => {
            const pct = Math.min(100, Math.round((h.delay / h.max) * 100))
            const color = pct > 60 ? '#E24B4A' : pct > 30 ? '#EF9F27' : '#5DCAA5'
            return (
              <div key={h.stage} className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-700">{h.stage}</span>
                  <span className="text-gray-400">{h.delay.toFixed(1)}d avg delay</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full">
                  <div className="h-1.5 rounded-full transition-all" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
                </div>
              </div>
            )
          })}
          {hotspots.every(h => h.delay === 0) && (
            <p className="text-sm text-green-600 text-center py-2">All stages within target!</p>
          )}
        </div>

        {/* Rework chart */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Rework Frequency by Stage</p>
          {reworkData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={reworkData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} dataKey="value" nameKey="name">
                  {reworkData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v} instances`, n]} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[180px] text-sm text-gray-400">No rework data yet</div>
          )}
        </div>
      </div>

      {/* Journey stacked bar */}
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">End-to-End Product Journey — Time Breakdown (days)</p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={products.map(p => ({
            name: p.name.length > 12 ? p.name.slice(0, 12) + '…' : p.name,
            Design: p.designDays,
            Sampling: p.samplingDays,
            Techpack: p.techpackDays,
            BOM: p.bomDays,
            Marketing: p.marketingDays,
          }))} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="Design"    stackId="a" fill={STAGE_COLORS.design}    />
            <Bar dataKey="Sampling"  stackId="a" fill={STAGE_COLORS.sampling}  />
            <Bar dataKey="Techpack"  stackId="a" fill={STAGE_COLORS.techpack}  />
            <Bar dataKey="BOM"       stackId="a" fill={STAGE_COLORS.bom}       />
            <Bar dataKey="Marketing" stackId="a" fill={STAGE_COLORS.marketing} radius={[4, 4, 0, 0]} />
            <Legend iconType="square" iconSize={8} formatter={(v) => <span className="text-xs">{v}</span>} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Tab: Design ──────────────────────────────────────────────────────────────

function DesignTab({ data }: { data: MgmtDashboardData }) {
  const { products, designerStats, heads } = data

  const cycleData = products.map(p => ({
    name: p.name.length > 10 ? p.name.slice(0, 10) + '…' : p.name,
    days: p.designDays,
    fill: p.designDays <= 7 ? '#5DCAA5' : p.designDays <= 9 ? '#EF9F27' : '#E24B4A',
  }))

  const fastestDesign = products.reduce((best, p) =>
    p.designDays > 0 && (best === null || p.designDays < best.designDays) ? p : best, null as ProductMetrics | null)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Avg Design Time"  value={`${data.stageAvgs.design}d`}       sub="Target: 7 days" color={data.stageAvgs.design > 7 ? '#E24B4A' : '#3B6D11'} />
        <MetricCard label="Approval Rate"    value={`${heads.design.firstPassRate}%`}  sub="First-pass approvals" color="#3B6D11" />
        <MetricCard label="Rework Count"     value={heads.design.reworks}              sub="Across all products" color={heads.design.reworks > 3 ? '#854F0B' : undefined} />
        <MetricCard label="Fastest Design"   value={fastestDesign ? `${fastestDesign.designDays}d` : '—'} sub={fastestDesign?.designerName ?? ''} color="#3B6D11" />
      </div>

      {/* Design head */}
      <HeadCard title={`${heads.design.name} — Design Head Performance`} stats={{
        'Avg Review Turnaround': `${heads.design.avgReviewDays}d`,
        'Rejections Issued': heads.design.rejections,
        'Rework Requests': heads.design.reworks,
        'First-Pass Approvals': `${heads.design.firstPassRate}%`,
      }} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Designer leaderboard */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Designer Leaderboard</p>
          <PersonBoard people={designerStats} daysLabel="design" />
          {designerStats.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">No designer assignments yet.</p>
          )}
        </div>

        {/* Design cycle chart */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Design Cycle Time per Product</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={cycleData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 14]} />
              <Tooltip formatter={(v) => [`${v}d`, 'Design days']} />
              <ReferenceLine y={7} stroke={TARGET_COLOR} strokeDasharray="5 5" label={{ value: 'Target 7d', position: 'right', fontSize: 10, fill: TARGET_COLOR }} />
              <Bar dataKey="days" radius={[4, 4, 0, 0]}>
                {cycleData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Designer table */}
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Designer Task Allocation & Performance</p>
        {designerStats.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
                <th className="text-left pb-2">Designer</th>
                <th className="text-right pb-2">Products</th>
                <th className="text-right pb-2">Avg Days</th>
                <th className="text-right pb-2">Reworks</th>
                <th className="text-right pb-2">Rejections</th>
                <th className="text-right pb-2">On-Time</th>
                <th className="text-right pb-2">Score</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {designerStats.map(d => (
                  <tr key={d.id}>
                    <td className="py-2 font-medium">{d.name}</td>
                    <td className="py-2 text-right text-gray-500">{d.products}</td>
                    <td className="py-2 text-right text-gray-500">{d.avgDays}d</td>
                    <td className="py-2 text-right text-gray-500">{d.reworks}</td>
                    <td className="py-2 text-right text-gray-500">{d.rejections}</td>
                    <td className="py-2 text-right text-gray-500">{d.onTime}/{d.products}</td>
                    <td className="py-2 text-right"><ScoreBadge score={d.score} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-400 py-4 text-center">Assign designers to products to see stats here.</p>
        )}
      </div>

      {/* Illustration approval rounds */}
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Illustration Approval Rounds per Product</p>
        <div className="space-y-0">
          {products.map(p => (
            <div key={p.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
              <span className="text-xs text-gray-400 w-32 shrink-0 truncate">{p.name}</span>
              <div className="flex items-center gap-1">
                {Array.from({ length: p.illustrationRounds }).map((_, i) => {
                  const bg = i === 0 ? '#5DCAA5' : i === 1 ? '#EF9F27' : '#E24B4A'
                  return (
                    <div key={i} style={{ background: bg }}
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-medium">
                      {i + 1}
                    </div>
                  )
                })}
              </div>
              <span className="text-xs text-gray-400 ml-1">{p.illustrationRounds} round{p.illustrationRounds !== 1 ? 's' : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Sampling ────────────────────────────────────────────────────────────

function SamplingTab({ data }: { data: MgmtDashboardData }) {
  const { products, heads, sampleRejectionReasons, samplerStats } = data
  // Sampling work is counted per DESIGN (colour variant), not per product:
  // a product with 4 colour SKUs = 4 sampled designs.
  const sumDesigns = (list: ProductMetrics[]) => list.reduce((n, p) => n + (p.designCount || 1), 0)
  const approvedProducts = products.filter(p => p.sampleStatus === 'approved')
  const rejectedProducts = products.filter(p => p.sampleStatus === 'rejected')
  const pendingProducts  = products.filter(p => p.sampleStatus === 'pending_review')
  const approvedCount   = sumDesigns(approvedProducts)
  const rejectedCount   = sumDesigns(rejectedProducts)
  const pendingCount    = sumDesigns(pendingProducts)
  const sampledProducts = products.filter(p => p.samplingDays > 0)
  const totalDesignsSampled = sumDesigns(sampledProducts)

  const samplingChartData = sampledProducts.map(p => ({
    name: p.name.length > 10 ? p.name.slice(0, 10) + '…' : p.name,
    days: p.samplingDays,
    fill: p.samplingDays <= 9 ? '#5DCAA5' : '#EF9F27',
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <MetricCard label="Designs Sampled"   value={totalDesignsSampled} sub={`${sampledProducts.length} products`} color="#3B6D11" />
        <MetricCard label="Approved"          value={approvedCount}   sub={`${approvedProducts.length} products · designs`} color="#3B6D11" />
        <MetricCard label="Rejected / Rework" value={rejectedCount}   sub="designs sent back"     color={rejectedCount > 0 ? '#854F0B' : undefined} />
        <MetricCard label="Pending Review"    value={pendingCount}    sub={`${pendingProducts.length} products · designs`} />
        <MetricCard label="Avg Sampling Time" value={data.stageAvgs.sampling > 0 ? `${data.stageAvgs.sampling}d` : '—'} sub="Target: 9 days" color={data.stageAvgs.sampling > 9 ? '#E24B4A' : '#3B6D11'} />
      </div>

      <HeadCard title={`${heads.merch.name} — Sample Review Performance`} stats={{
        'Avg Review Turnaround': heads.merch.avgReviewDays !== null ? `${heads.merch.avgReviewDays}d` : '—',
        'First-Pass Rate': `${heads.merch.firstPassRate}%`,
        'Total Rejections': heads.merch.rejections,
        'Rework Requests': heads.merch.reworks,
      }} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Sampling Days per Product</p>
          {samplingChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={samplingChartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v}d`, 'Sampling days']} />
                <ReferenceLine y={9} stroke={TARGET_COLOR} strokeDasharray="5 5" label={{ value: 'Target 9d', position: 'right', fontSize: 10, fill: TARGET_COLOR }} />
                <Bar dataKey="days" radius={[4, 4, 0, 0]}>
                  {samplingChartData.map((_, i) => <Cell key={i} fill={samplingChartData[i].fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-sm text-gray-400">No sampling data yet</div>
          )}
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Sample Rejection Analysis</p>
          {sampleRejectionReasons.length > 0 ? (
            <div className="space-y-4">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={sampleRejectionReasons} cx="50%" cy="50%" innerRadius={40} outerRadius={70} dataKey="count" nameKey="reason">
                    {sampleRejectionReasons.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {sampleRejectionReasons.map((r, i) => (
                  <div key={r.reason} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-sm text-gray-700 flex-1">{r.reason}</span>
                    <span className="text-sm font-medium text-gray-500">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">No sample rejections recorded.</p>
          )}
        </div>
      </div>

      {/* Sampler leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Sampling Team Leaderboard</p>
          {samplerStats.length > 0 ? (
            <PersonBoard people={samplerStats} daysLabel="sampling" />
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">No sampling assignments yet. Assign team members on each product&apos;s Sampling tab.</p>
          )}
        </div>
        {samplerStats.length > 0 && (
          <div className="bg-white border border-gray-100 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Sampler Task Performance</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
                  <th className="text-left pb-2">Person</th>
                  <th className="text-right pb-2">Products</th>
                  <th className="text-right pb-2">Avg Days</th>
                  <th className="text-right pb-2">Reworks</th>
                  <th className="text-right pb-2">On-Time</th>
                  <th className="text-right pb-2">Score</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {samplerStats.map(s => (
                    <tr key={s.id}>
                      <td className="py-2 font-medium">{s.name}</td>
                      <td className="py-2 text-right text-gray-500">{s.products}</td>
                      <td className="py-2 text-right text-gray-500">{s.avgDays}d</td>
                      <td className="py-2 text-right text-gray-500">{s.reworks}</td>
                      <td className="py-2 text-right text-gray-500">{s.onTime}/{s.products}</td>
                      <td className="py-2 text-right"><ScoreBadge score={s.score} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Per-product sampling status */}
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Per-Product Sampling Status</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
              <th className="text-left pb-2">Product</th>
              <th className="text-left pb-2">Assigned To</th>
              <th className="text-center pb-2">Designs</th>
              <th className="text-right pb-2">Days at Sampling</th>
              <th className="text-center pb-2">Status</th>
              {rejectedCount > 0 && <th className="text-left pb-2">Notes</th>}
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {products.map(p => (
                <tr key={p.id}>
                  <td className="py-2 font-medium text-xs text-gray-800">{p.name}</td>
                  <td className="py-2 text-xs text-gray-500">{p.samplerName ?? <span className="text-gray-300">Unassigned</span>}</td>
                  <td className="py-2 text-center">
                    <span className="inline-block px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full text-xs font-medium">{p.designCount}</span>
                  </td>
                  <td className="py-2 text-right text-xs text-gray-500">{p.samplingDays > 0 ? `${p.samplingDays}d` : '—'}</td>
                  <td className="py-2 text-center">
                    {p.sampleStatus === 'approved'
                      ? <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">Approved</span>
                      : p.sampleStatus === 'rejected'
                      ? <span className="inline-block px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">Rejected</span>
                      : p.sampleStatus === 'pending_review'
                      ? <span className="inline-block px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs">In Review</span>
                      : <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">Not Started</span>
                    }
                  </td>
                  {rejectedCount > 0 && (
                    <td className="py-2 text-xs text-gray-500 max-w-[200px] truncate">{p.sampleFeedback ?? '—'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Merchandising ───────────────────────────────────────────────────────

function MerchandisingTab({ data }: { data: MgmtDashboardData }) {
  const { products, jrMerchStats, heads } = data

  const techpackChartData = products.map(p => ({
    name: p.name.length > 10 ? p.name.slice(0, 10) + '…' : p.name,
    days: p.techpackDays,
    fill: p.techpackDays <= 3 ? '#5DCAA5' : '#EF9F27',
  }))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Techpack TAT"         value={data.stageAvgs.techpack > 0 ? `${data.stageAvgs.techpack}d` : '—'} sub="Target: 3 days" color={data.stageAvgs.techpack > 3 ? '#E24B4A' : '#3B6D11'} />
        <MetricCard label="Techpack Approvals"   value={`${heads.merch.firstPassRate > 0 ? heads.merch.firstPassRate : 0}%`} sub="Accuracy" color="#3B6D11" />
        <MetricCard label="Reworks"              value={jrMerchStats.reduce((s, j) => s + j.reworks, 0)} sub="Across all Jr Merch" color={jrMerchStats.reduce((s, j) => s + j.reworks, 0) > 2 ? '#854F0B' : undefined} />
        <MetricCard label="Jr Merch Assigned"    value={jrMerchStats.length} sub="Team members with work" />
      </div>

      <HeadCard title={`${heads.merch.name} — Merchandising Head Overview`} stats={{
        'Sample Review Turnaround': heads.merch.avgReviewDays !== null ? `${heads.merch.avgReviewDays}d` : '—',
        'Sample Rejections': heads.merch.rejections,
        'Techpack Reworks': jrMerchStats.reduce((s, j) => s + j.reworks, 0),
        'Techpack Accuracy': `${heads.merch.firstPassRate > 0 ? heads.merch.firstPassRate : 0}%`,
      }} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Jr Merchandiser Leaderboard</p>
          <PersonBoard people={jrMerchStats} daysLabel="techpack" />
          {jrMerchStats.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center">No merchandising assignments yet.</p>
          )}
        </div>

        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Techpack Entry Time per Product</p>
          {techpackChartData.some(d => d.days > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={techpackChartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v}d`, 'Techpack days']} />
                <ReferenceLine y={3} stroke={TARGET_COLOR} strokeDasharray="5 5" label={{ value: 'Target 3d', position: 'right', fontSize: 10, fill: TARGET_COLOR }} />
                <Bar dataKey="days" radius={[4, 4, 0, 0]}>
                  {techpackChartData.map((_, i) => <Cell key={i} fill={techpackChartData[i].fill} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-sm text-gray-400">No techpack data yet</div>
          )}
        </div>
      </div>

      {jrMerchStats.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Jr Merchandiser Task Performance</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
                <th className="text-left pb-2">Person</th>
                <th className="text-right pb-2">Products</th>
                <th className="text-right pb-2">Avg Techpack Days</th>
                <th className="text-right pb-2">Reworks</th>
                <th className="text-right pb-2">Accuracy</th>
                <th className="text-right pb-2">On-Time</th>
                <th className="text-right pb-2">Score</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {jrMerchStats.map(m => (
                  <tr key={m.id}>
                    <td className="py-2 font-medium">{m.name}</td>
                    <td className="py-2 text-right text-gray-500">{m.products}</td>
                    <td className="py-2 text-right text-gray-500">{m.avgDays}d</td>
                    <td className="py-2 text-right text-gray-500">{m.reworks}</td>
                    <td className="py-2 text-right text-gray-500">{m.accuracy ?? '—'}</td>
                    <td className="py-2 text-right text-gray-500">{m.onTime}/{m.products}</td>
                    <td className="py-2 text-right"><ScoreBadge score={m.score} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Tab: BOM ────────────────────────────────────────────────────────────────

function BomTab({ data }: { data: MgmtDashboardData }) {
  const { bomLog, bomExecStats, heads } = data
  const completedBom = bomLog.filter(b => b.invId)
  const nonZeroDays  = bomLog.filter(b => b.days > 0)
  const avgBomDays   = nonZeroDays.length > 0
    ? Math.round(nonZeroDays.reduce((s, b) => s + b.days, 0) / nonZeroDays.length * 10) / 10
    : data.stageAvgs.bom

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Avg BOM Entry Time" value={`${avgBomDays || '—'}${avgBomDays ? 'd' : ''}`} sub="Target: 3 days"     color={avgBomDays > 3 ? '#E24B4A' : '#3B6D11'} />
        <MetricCard label="INV Generated"      value={completedBom.length}                             sub="Unique SKUs"        color="#3B6D11" />
        <MetricCard label="Entry Errors"        value={bomLog.filter(b => b.errors > 0).length}        sub="Required correction" color={bomLog.filter(b => b.errors > 0).length > 0 ? '#A32D2D' : undefined} />
        <MetricCard label="Approval Rate"       value={completedBom.length > 0 ? `${heads.bom.approvalRate}%` : '—'} sub="Products with INV" color={completedBom.length > 0 && heads.bom.approvalRate === 100 ? '#3B6D11' : '#854F0B'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* BOM team performance — real data from bomExecStats */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">BOM Team Performance</p>
          {bomExecStats.length > 0 ? (
            <PersonBoard people={bomExecStats} daysLabel="entry" />
          ) : (
            <p className="text-sm text-gray-400 py-4 text-center">No BOM assignments recorded yet.</p>
          )}
          <div className="mt-4 pt-4 border-t border-gray-50">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Head Review Stats</p>
            <div className="grid grid-cols-3 gap-3">
              <div><p className="text-xs text-gray-400">Avg Entry Days</p><p className="font-medium">{heads.bom.avgReviewDays != null ? `${heads.bom.avgReviewDays}d` : '—'}</p></div>
              <div><p className="text-xs text-gray-400">INV Pass Rate</p><p className="font-medium text-green-600">{heads.bom.approvalRate}%</p></div>
              <div><p className="text-xs text-gray-400">Products Done</p><p className="font-medium">{completedBom.length}</p></div>
            </div>
          </div>
        </div>

        {/* BOM chart */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">BOM Entry Days per Product</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={bomLog.map(b => ({
              name: b.productName.length > 12 ? b.productName.slice(0, 12) + '…' : b.productName,
              days: b.days,
              fill: b.errors > 0 ? '#EF9F27' : '#5DCAA5',
            }))} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 6]} />
              <Tooltip formatter={(v) => [`${v}d`, 'BOM entry days']} />
              <ReferenceLine y={3} stroke={TARGET_COLOR} strokeDasharray="5 5" />
              <Bar dataKey="days" radius={[4, 4, 0, 0]}>
                {bomLog.map((entry, i) => <Cell key={i} fill={entry.errors > 0 ? '#EF9F27' : '#5DCAA5'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* BOM table */}
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">BOM Data Entry & INV Generation Log</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
              <th className="text-left pb-2">Product</th>
              <th className="text-left pb-2">Assigned To</th>
              <th className="text-right pb-2">Entry Days</th>
              <th className="text-center pb-2">Errors</th>
              <th className="text-left pb-2">INV ID</th>
              <th className="text-center pb-2">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {bomLog.map(b => (
                <tr key={b.productId}>
                  <td className="py-2">
                    <p className="font-medium text-gray-800 text-xs">{b.productName}</p>
                  </td>
                  <td className="py-2 text-xs text-gray-500">{b.exec}</td>
                  <td className="py-2 text-right text-xs">{b.days > 0 ? `${b.days}d` : '—'}</td>
                  <td className="py-2 text-center">
                    {b.errors > 0
                      ? <span className="inline-block px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs">{b.errors} error</span>
                      : <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">Clean</span>
                    }
                  </td>
                  <td className="py-2 text-xs font-mono text-gray-500">{b.invId ?? '—'}</td>
                  <td className="py-2 text-center">
                    {b.invId
                      ? <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">Approved</span>
                      : <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-xs">{b.status}</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Tab: Marketing ───────────────────────────────────────────────────────────

function MarketingTab({ data }: { data: MgmtDashboardData }) {
  const { products, mktRoles, marketingDeliverables, heads } = data

  const tatData = products.map(p => ({
    name: p.name.length > 10 ? p.name.slice(0, 10) + '…' : p.name,
    days: p.marketingDays,
    fill: p.marketingDays <= 7 ? '#5DCAA5' : '#EF9F27',
  }))

  const delayedCount = products.filter(p => p.marketingDays > 7).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard label="Avg Marketing TAT"     value={`${data.stageAvgs.marketing}d`}  sub="Target: 7 days"       color={data.stageAvgs.marketing > 7 ? '#E24B4A' : '#3B6D11'} />
        <MetricCard label="Photoshoots Done"      value={products.filter(p => p.mktPhotoshoot).length}   sub="Products shot"       color="#3B6D11" />
        <MetricCard label="A+ / Catalog Content"  value={products.filter(p => p.mktCatalog).length}      sub="Completed"           color="#3B6D11" />
        <MetricCard label="Delayed Deliverables"  value={delayedCount}                                    sub="Over 7-day target"   color={delayedCount > 0 ? '#854F0B' : undefined} />
      </div>

      <HeadCard title={`${heads.marketing.name} — Marketing Head Overview`} stats={{
        'Content Review TAT': heads.marketing.avgReviewDays != null ? `${heads.marketing.avgReviewDays}d` : '—',
        'Revision Requests': heads.marketing.revisions,
        'On-Time Approvals': `${heads.marketing.onTimeRate}%`,
        'Launch Decks Signed Off': heads.marketing.decksSignedOff,
      }} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Deliverable completion */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Marketing Deliverable Completion</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={marketingDeliverables} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="completed" name="Completed" stackId="a" fill="#5DCAA5" radius={[0, 0, 0, 0]} />
              <Bar dataKey="delayed"   name="Delayed"   stackId="a" fill="#EF9F27" radius={[4, 4, 0, 0]} />
              <Legend iconType="square" iconSize={8} formatter={(v) => <span className="text-xs">{v}</span>} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* TAT per product */}
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Deliverable TAT per Product (days)</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={tatData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} domain={[0, 12]} />
              <Tooltip formatter={(v) => [`${v}d`, 'Marketing days']} />
              <ReferenceLine y={7} stroke={TARGET_COLOR} strokeDasharray="5 5" />
              <Bar dataKey="days" radius={[4, 4, 0, 0]}>
                {tatData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-person stats if available */}
      {mktRoles.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Marketing Team Performance</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
                <th className="text-left pb-2">Person</th>
                <th className="text-right pb-2">Products</th>
                <th className="text-right pb-2">Avg Days</th>
                <th className="text-right pb-2">Updates</th>
                <th className="text-right pb-2">On-Time</th>
                <th className="text-right pb-2">Score</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {mktRoles.map(r => (
                  <tr key={r.role}>
                    <td className="py-2 font-medium">{r.role}</td>
                    <td className="py-2 text-right text-gray-500">{r.products}</td>
                    <td className="py-2 text-right text-gray-500">{r.avgDays > 0 ? `${r.avgDays}d` : '—'}</td>
                    <td className="py-2 text-right text-gray-500">{r.revisions}</td>
                    <td className="py-2 text-right text-gray-500">{r.onTime}/{r.products}</td>
                    <td className="py-2 text-right"><ScoreBadge score={r.score} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Per-product deliverable status — real data */}
      <div className="bg-white border border-gray-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Per-Product Deliverable Status</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
              <th className="text-left pb-2">Product</th>
              <th className="text-center pb-2">Photoshoot</th>
              <th className="text-center pb-2">A+ / Catalog</th>
              <th className="text-center pb-2">Launch Deck</th>
              <th className="text-right pb-2">Days</th>
              <th className="text-right pb-2">Status</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {data.mktDeliverableRows.map(r => (
                <tr key={r.productId}>
                  <td className="py-2">
                    <p className="font-medium text-xs text-gray-800 truncate max-w-[130px]">{r.productName}</p>
                    {r.assignedTo && <p className="text-[10px] text-gray-400">{r.assignedTo}</p>}
                  </td>
                  <td className="py-2 text-center">{r.photoshoot      ? '✓' : <span className="text-gray-300">—</span>}</td>
                  <td className="py-2 text-center">{r.catalog         ? '✓' : <span className="text-gray-300">—</span>}</td>
                  <td className="py-2 text-center">{r.launchCreative  ? '✓' : <span className="text-gray-300">—</span>}</td>
                  <td className="py-2 text-right text-gray-500 text-xs">{r.daysInMarketing > 0 ? `${r.daysInMarketing}d` : '—'}</td>
                  <td className="py-2 text-right">
                    {r.isCompleted
                      ? <span className="inline-block px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">Done</span>
                      : r.daysInMarketing > 0
                        ? <span className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">In Progress</span>
                        : <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-400 rounded-full text-xs">Not started</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

const TABS = [
  { id: 'overall',    label: 'Overall' },
  { id: 'design',     label: 'Design' },
  { id: 'sampling',   label: 'Sampling' },
  { id: 'merch',      label: 'Merchandising' },
  { id: 'bom',        label: 'BOM' },
  { id: 'marketing',  label: 'Marketing' },
]

export function MgmtDashboard({ data }: { data: MgmtDashboardData }) {
  const [activeTab, setActiveTab] = useState('overall')

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-2 flex-wrap mb-6 border-b border-gray-100 pb-4">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
              activeTab === tab.id
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overall'   && <OverallTab       data={data} />}
      {activeTab === 'design'    && <DesignTab        data={data} />}
      {activeTab === 'sampling'  && <SamplingTab      data={data} />}
      {activeTab === 'merch'     && <MerchandisingTab data={data} />}
      {activeTab === 'bom'       && <BomTab           data={data} />}
      {activeTab === 'marketing' && <MarketingTab     data={data} />}
    </div>
  )
}

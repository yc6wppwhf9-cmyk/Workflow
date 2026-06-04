import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { MgmtDashboard } from '@/components/reports/mgmt-dashboard'
import type { MgmtDashboardData, ProductMetrics, PersonStat, BomLogRow, MktRole, MktDeliverableRow } from '@/components/reports/mgmt-dashboard'

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

function stageDays(start: string | null | undefined, end: string | null | undefined): number {
  if (!start) return 0
  const endTs = end ? new Date(end).getTime() : Date.now()
  return Math.max(0, Math.round((endTs - new Date(start).getTime()) / 86400000))
}

function computeScore(avgDays: number, targetDays: number, reworks: number, rejections: number, onTimeCount: number, total: number): number {
  if (total === 0) return 0
  const overTarget = Math.max(0, avgDays - targetDays)
  const onTimeRate = onTimeCount / total
  const raw = 100 - overTarget * 6 - reworks * 7 - rejections * 4 + onTimeRate * 8
  return Math.max(0, Math.min(100, Math.round(raw)))
}

function avgOf(arr: number[]) {
  const nonZero = arr.filter(v => v > 0)
  return nonZero.length > 0 ? Math.round(nonZero.reduce((s, v) => s + v, 0) / nonZero.length * 10) / 10 : 0
}

export default async function ManagementReviewPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'management'].includes(profile?.role ?? '')) redirect('/dashboard')

  const [
    { data: rawProducts },
    { data: rawIlloFiles },
    { data: rawProfiles },
    { data: rawStageLogs },
    { data: rawMiscLogs },
  ] = await Promise.all([
    supabase.from('products').select(`
      id, name, category, brand, workflow_stage, created_at,
      design_data(assigned_to, updated_at, is_completed, color_skus),
      sampling_data(assigned_to, sample_review_status, designer_feedback, reviewed_at, is_completed, updated_at),
      merchandising_data(assigned_to, updated_at, is_completed),
      bom_data(fg_inv_code, updated_at, is_completed, updated_by),
      marketing_data(updated_at, is_completed, photoshoots, catalogs, launch_creatives, product_features, updated_by)
    `).order('created_at', { ascending: false }),

    supabase.from('product_files')
      .select('id, product_id, review_status, uploaded_by, reviewed_by, created_at, reviewed_at')
      .eq('department', 'design')
      .is('colour_tag', null),

    supabase.from('profiles')
      .select('id, full_name, role')
      .eq('is_active', true),

    supabase.from('activity_logs')
      .select('product_id, action, created_at')
      .ilike('action', '%stage advanced%')
      .order('created_at', { ascending: true }),

    // Sampling submission times + marketing update counts
    supabase.from('activity_logs')
      .select('product_id, action, created_at')
      .or('action.ilike.%sent to management for approval%,action.ilike.%updated marketing%')
      .order('created_at', { ascending: true }),
  ])

  const products = rawProducts || []
  const illoFiles = rawIlloFiles || []
  const profiles = rawProfiles || []

  const profileMap = new Map(profiles.map(p => [p.id, p]))

  // Sample submission timestamps (latest per product)
  const sampleSubmitTime = new Map<string, string>()
  // Marketing update counts per product
  const mktUpdateCount = new Map<string, number>()
  for (const log of rawMiscLogs || []) {
    if (!log.product_id || !log.created_at) continue
    if (log.action.toLowerCase().includes('sent to management for approval')) {
      sampleSubmitTime.set(log.product_id, log.created_at)
    }
    if (log.action.toLowerCase().includes('updated marketing')) {
      mktUpdateCount.set(log.product_id, (mktUpdateCount.get(log.product_id) || 0) + 1)
    }
  }

  // Illustration files grouped by product
  const illoByProduct = new Map<string, typeof illoFiles>()
  for (const f of illoFiles) {
    if (!illoByProduct.has(f.product_id)) illoByProduct.set(f.product_id, [])
    illoByProduct.get(f.product_id)!.push(f)
  }

  // ── Product metrics ─────────────────────────────────────────────────────
  const productMetrics: ProductMetrics[] = products.map(p => {
    const design = one(p.design_data)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sampling = one(p.sampling_data) as any
    const merch = one(p.merchandising_data)
    const bom = one(p.bom_data)
    const mkt = one(p.marketing_data)

    // If the product has advanced past a stage (even without is_completed flag being set),
    // use updated_at as a proxy for when that stage was finished.
    const s = p.workflow_stage
    const pastDesign   = ['sampling_completed','merchandising_completed','bom_finalized','marketing_ready','sales_priced','product_live'].includes(s)
    const pastSampling = ['merchandising_completed','bom_finalized','marketing_ready','sales_priced','product_live'].includes(s)
    const pastMerch    = ['bom_finalized','marketing_ready','sales_priced','product_live'].includes(s)
    const pastBom      = ['marketing_ready','sales_priced','product_live'].includes(s)

    const designEnd   = (design?.is_completed   || pastDesign)   ? (design?.updated_at   ?? null) : null
    const samplingEnd = (sampling?.is_completed || pastSampling) ? (sampling?.updated_at ?? null) : null
    const merchEnd    = (merch?.is_completed    || pastMerch)    ? (merch?.updated_at    ?? null) : null
    const bomEnd      = (bom?.is_completed      || pastBom)      ? (bom?.updated_at      ?? null) : null
    const mktEnd      = mkt?.is_completed                        ? (mkt?.updated_at      ?? null) : null

    const designDays    = stageDays(p.created_at, designEnd)
    const samplingDays  = designEnd   ? stageDays(designEnd,   samplingEnd) : 0
    const techpackDays  = samplingEnd ? stageDays(samplingEnd, merchEnd)    : 0
    const bomDays       = merchEnd    ? stageDays(merchEnd,    bomEnd)      : 0
    const marketingDays = bomEnd      ? stageDays(bomEnd,      mktEnd)      : 0
    const totalDays     = stageDays(p.created_at, mktEnd)

    const productFiles = illoByProduct.get(p.id) || []
    const rejectedFiles = productFiles.filter(f => f.review_status === 'rejected').length
    const illustrationRounds = Math.max(1, 1 + rejectedFiles)

    const designerName = design?.assigned_to   ? (profileMap.get(design.assigned_to)?.full_name   ?? null) : null
    const jrMerchName  = merch?.assigned_to   ? (profileMap.get(merch.assigned_to)?.full_name    ?? null) : null
    const samplerName  = sampling?.assigned_to ? (profileMap.get(sampling.assigned_to)?.full_name ?? null) : null

    // Number of colour variants (designs) in this product — each is one unit of sampling work
    const colourSkus  = (design as { color_skus?: string[] | null } | null)?.color_skus
    const designCount = Math.max(1, Array.isArray(colourSkus) ? colourSkus.length : 0)

    const isFullyComplete = ['sales_priced', 'product_live'].includes(p.workflow_stage) || Boolean(mkt?.is_completed)
    const delayDays = Math.max(0, totalDays - 30)
    const status: ProductMetrics['status'] =
      isFullyComplete ? (delayDays > 5 ? 'delayed' : 'completed') :
      totalDays > 38  ? 'at_risk' :
      totalDays > 30  ? 'delayed' : 'in_progress'

    // Marketing deliverables — read actual DB fields
    const photoshoots     = (mkt as { photoshoots?: string | null } | null)?.photoshoots
    const catalogs        = (mkt as { catalogs?: string[] | null } | null)?.catalogs
    const launchCreatives = (mkt as { launch_creatives?: string | null } | null)?.launch_creatives
    const mktUpdatedBy    = (mkt as { updated_by?: string | null } | null)?.updated_by

    // BOM executor for this product
    const bomUpdatedBy = (bom as { updated_by?: string | null } | null)?.updated_by

    return {
      id: p.id,
      name: p.name,
      stage: p.workflow_stage,
      status,
      designDays,
      samplingDays,
      techpackDays,
      bomDays,
      marketingDays,
      totalDays,
      illustrationRounds,
      illustrationRejections: rejectedFiles,
      designerName,
      designerId: design?.assigned_to ?? null,
      jrMerchName,
      jrMerchId: merch?.assigned_to ?? null,
      samplerName,
      samplerId: sampling?.assigned_to ?? null,
      delayDays,
      designCount,
      sampleStatus: sampling?.sample_review_status ?? null,
      sampleFeedback: sampling?.designer_feedback ?? null,
      invId: bom?.fg_inv_code ?? null,
      bomUpdatedBy: bomUpdatedBy ?? null,
      mktPhotoshoot: Boolean(photoshoots),
      mktCatalog: Array.isArray(catalogs) ? catalogs.length > 0 : Boolean(catalogs),
      mktLaunchCreative: Boolean(launchCreatives),
      mktUpdatedBy: mktUpdatedBy ?? null,
    }
  })

  // ── Designer stats ──────────────────────────────────────────────────────
  const designerMap = new Map<string, { products: string[]; rejections: number; onTime: number }>()
  for (const pm of productMetrics) {
    if (!pm.designerId) continue
    if (!designerMap.has(pm.designerId)) designerMap.set(pm.designerId, { products: [], rejections: 0, onTime: 0 })
    const ds = designerMap.get(pm.designerId)!
    ds.products.push(pm.id)
    ds.rejections += pm.illustrationRejections
    if (pm.delayDays === 0) ds.onTime++
  }
  const designerStats: PersonStat[] = Array.from(designerMap.entries()).map(([id, ds]) => {
    const name = profileMap.get(id)?.full_name ?? id
    const assigned = productMetrics.filter(pm => pm.designerId === id)
    const avgDays = assigned.length > 0
      ? Math.round(assigned.reduce((s, pm) => s + pm.designDays, 0) / assigned.length * 10) / 10 : 0
    const reworks = assigned.filter(pm => pm.illustrationRounds > 1).length
    const score = computeScore(avgDays, 7, reworks, ds.rejections, ds.onTime, ds.products.length)
    return { id, name, products: ds.products.length, avgDays, reworks, rejections: ds.rejections, onTime: ds.onTime, score }
  }).sort((a, b) => b.score - a.score)

  // ── Jr Merch stats ──────────────────────────────────────────────────────
  const jrMerchMap = new Map<string, { products: string[]; reworks: number; onTime: number }>()
  for (const pm of productMetrics) {
    if (!pm.jrMerchId) continue
    // Only count people whose role is actually merchandising — prevents sampling
    // team members assigned to merch data from appearing in this leaderboard.
    const role = profileMap.get(pm.jrMerchId)?.role
    if (!role || !['merchandising', 'merchandising_head'].includes(role)) continue
    if (!jrMerchMap.has(pm.jrMerchId)) jrMerchMap.set(pm.jrMerchId, { products: [], reworks: 0, onTime: 0 })
    const ms = jrMerchMap.get(pm.jrMerchId)!
    ms.products.push(pm.id)
    if (pm.sampleStatus === 'rejected') ms.reworks++
    if (pm.delayDays === 0) ms.onTime++
  }
  const jrMerchStats: PersonStat[] = Array.from(jrMerchMap.entries()).map(([id, ms]) => {
    const name = profileMap.get(id)?.full_name ?? id
    const assigned = productMetrics.filter(pm => pm.jrMerchId === id)
    const avgDays = assigned.length > 0
      ? Math.round(assigned.reduce((s, pm) => s + pm.techpackDays, 0) / assigned.length * 10) / 10 : 0
    const score = computeScore(avgDays, 3, ms.reworks, 0, ms.onTime, ms.products.length)
    const accuracy = ms.products.length > 0
      ? `${Math.round(((ms.products.length - ms.reworks) / ms.products.length) * 100)}%` : '100%'
    return { id, name, products: ms.products.length, avgDays, reworks: ms.reworks, rejections: 0, onTime: ms.onTime, score, accuracy } as PersonStat
  }).sort((a, b) => b.score - a.score)

  // ── Sampler stats ───────────────────────────────────────────────────────
  const samplerMap = new Map<string, { products: string[]; reworks: number; onTime: number }>()
  for (const pm of productMetrics) {
    if (!pm.samplerId) continue
    if (!samplerMap.has(pm.samplerId)) samplerMap.set(pm.samplerId, { products: [], reworks: 0, onTime: 0 })
    const ss = samplerMap.get(pm.samplerId)!
    ss.products.push(pm.id)
    if (pm.sampleStatus === 'rejected') ss.reworks++
    if (pm.samplingDays > 0 && pm.samplingDays <= 9) ss.onTime++
  }
  const samplerStats: PersonStat[] = Array.from(samplerMap.entries()).map(([id, ss]) => {
    const name = profileMap.get(id)?.full_name ?? id
    const assigned = productMetrics.filter(pm => pm.samplerId === id)
    const avgDays = assigned.length > 0
      ? Math.round(assigned.reduce((s, pm) => s + pm.samplingDays, 0) / assigned.length * 10) / 10 : 0
    const score = computeScore(avgDays, 9, ss.reworks, 0, ss.onTime, ss.products.length)
    return { id, name, products: ss.products.length, avgDays, reworks: ss.reworks, rejections: 0, onTime: ss.onTime, score }
  }).sort((a, b) => b.score - a.score)

  // ── BOM log — only products that have ACTUAL BOM work done ──────────────
  // Products at BOM stage with zero work (bomDays=0, no invId, no updatedBy) are
  // excluded — they're pending, not "logged". They show up in the pending count only.
  const BOM_STAGES = ['bom_finalized', 'marketing_ready', 'sales_priced', 'product_live']
  const bomLog: BomLogRow[] = productMetrics
    .filter(pm => BOM_STAGES.includes(pm.stage) && (pm.bomDays > 0 || pm.invId !== null || pm.bomUpdatedBy !== null))
    .map(pm => {
      const execId   = pm.bomUpdatedBy
      const execName = execId ? (profileMap.get(execId)?.full_name ?? 'BOM Team') : 'BOM Team'
      return {
        productId:   pm.id,
        productName: pm.name,
        exec:        execName,
        days:        pm.bomDays,
        errors:      0,
        invId:       pm.invId,
        status:      pm.invId ? 'Approved' : pm.bomDays > 0 ? 'In Progress' : 'Pending',
      }
    })

  // BOM exec stats — only people who have actually done work (exclude generic fallback)
  const bomExecMap = new Map<string, { name: string; products: string[]; totalDays: number; withInv: number }>()
  for (const row of bomLog) {
    if (!row.exec || row.exec === 'BOM Team') continue  // skip generic fallback
    const key = row.exec
    if (!bomExecMap.has(key)) bomExecMap.set(key, { name: key, products: [], totalDays: 0, withInv: 0 })
    const bs = bomExecMap.get(key)!
    bs.products.push(row.productId)
    bs.totalDays += row.days
    if (row.invId) bs.withInv++
  }
  const bomExecStats: PersonStat[] = Array.from(bomExecMap.entries()).map(([, bs]) => {
    const total  = bs.products.length
    const avgDays = total > 0 ? Math.round(bs.totalDays / total * 10) / 10 : 0
    const onTime  = productMetrics.filter(pm => bs.products.includes(pm.id) && pm.bomDays > 0 && pm.bomDays <= 3).length
    const score   = computeScore(avgDays, 3, 0, 0, onTime, total)
    const execProfile = profiles.find(p => p.full_name === bs.name)
    return { id: execProfile?.id ?? bs.name, name: bs.name, products: total, avgDays, reworks: 0, rejections: 0, onTime, score }
  }).sort((a, b) => b.score - a.score)

  // BOM approval rate from real data
  const bomWithInv = bomLog.filter(b => b.invId).length
  const bomApprovalRate = bomLog.length > 0 ? Math.round((bomWithInv / bomLog.length) * 100) : 0

  // ── Head stats ──────────────────────────────────────────────────────────
  const designHead = profiles.find(p => p.role === 'design_head')
  const merchHead  = profiles.find(p => p.role === 'merchandising_head')

  // Design head — real review TAT from product_files timestamps
  const reviewedFiles = illoFiles.filter(f => f.reviewed_at && f.created_at)
  const avgDesignReviewDays = reviewedFiles.length > 0
    ? Math.round(reviewedFiles.reduce((s, f) => s + stageDays(f.created_at, f.reviewed_at), 0) / reviewedFiles.length * 10) / 10
    : 0
  const rejectedIlloFiles = illoFiles.filter(f => f.review_status === 'rejected').length
  const firstPassApproved = productMetrics.filter(pm => pm.illustrationRounds === 1).length
  const designFirstPassRate = productMetrics.length > 0
    ? Math.round((firstPassApproved / productMetrics.length) * 100) : 0

  // Merch head — sampling review TAT from submission logs
  const reviewedSamplings = products.filter(p => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = one(p.sampling_data) as any
    return s?.reviewed_at && sampleSubmitTime.has(p.id)
  })
  const samplingHeadTAT: number | null = reviewedSamplings.length > 0
    ? Math.round(reviewedSamplings.reduce((sum, p) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const s = one(p.sampling_data) as any
        const submitAt = sampleSubmitTime.get(p.id)
        if (!s?.reviewed_at || !submitAt) return sum
        return sum + stageDays(submitAt, s.reviewed_at)
      }, 0) / reviewedSamplings.length * 10) / 10
    : null
  const sampleRejections = productMetrics.filter(pm => pm.sampleStatus === 'rejected').length
  const sampleApproved   = productMetrics.filter(pm => pm.sampleStatus === 'approved').length
  const sampleFirstPassRate = productMetrics.length > 0
    ? Math.round((sampleApproved / productMetrics.length) * 100) : 0

  // BOM head — avg review time (approx from BOM days)
  const bomAvgDays = avgOf(productMetrics.filter(pm => pm.bomDays > 0).map(pm => pm.bomDays))

  // Marketing head — real computed values
  const totalMktRevisions = Array.from(mktUpdateCount.values()).reduce((s, v) => s + v, 0)
  const mktStarted = productMetrics.filter(pm => pm.marketingDays > 0)
  const mktOnTimeRate = mktStarted.length > 0
    ? Math.round(mktStarted.filter(pm => pm.marketingDays <= 7).length / mktStarted.length * 100) : 0
  const mktHeadProfile = profiles.find(p => p.role === 'marketing')

  // ── Overall ──────────────────────────────────────────────────────────────
  const completedProducts = productMetrics.filter(pm => ['completed', 'delayed'].includes(pm.status))
  const avgCycleTime = completedProducts.length > 0
    ? Math.round(completedProducts.reduce((s, pm) => s + pm.totalDays, 0) / completedProducts.length * 10) / 10 : 0
  const onTimeCount  = productMetrics.filter(pm => pm.delayDays === 0).length
  const totalReworks = productMetrics.reduce((s, pm) => s + pm.illustrationRejections, 0) + sampleRejections

  const stageAvgs = {
    design:    avgOf(productMetrics.map(pm => pm.designDays)),
    sampling:  avgOf(productMetrics.map(pm => pm.samplingDays)),
    techpack:  avgOf(productMetrics.map(pm => pm.techpackDays)),
    bom:       avgOf(productMetrics.map(pm => pm.bomDays)),
    marketing: avgOf(productMetrics.map(pm => pm.marketingDays)),
  }

  // ── Sample rejection reasons ─────────────────────────────────────────────
  const keywords: Record<string, string> = {
    stitch: 'Stitching quality', color: 'Color mismatch', colour: 'Color mismatch',
    size: 'Size deviation', dimension: 'Size deviation', hardware: 'Hardware defect', zipper: 'Hardware defect',
  }
  const reasonCount: Record<string, number> = {}
  for (const pm of productMetrics.filter(pm => pm.sampleStatus === 'rejected' && pm.sampleFeedback)) {
    const lower = pm.sampleFeedback!.toLowerCase()
    let matched = false
    for (const [kw, label] of Object.entries(keywords)) {
      if (lower.includes(kw)) { reasonCount[label] = (reasonCount[label] || 0) + 1; matched = true; break }
    }
    if (!matched) reasonCount['Other'] = (reasonCount['Other'] || 0) + 1
  }
  const sampleRejectionReasons = Object.entries(reasonCount).map(([reason, count]) => ({ reason, count }))
  if (sampleRejectionReasons.length === 0 && sampleRejections > 0) {
    sampleRejectionReasons.push({ reason: 'Quality issues', count: sampleRejections })
  }

  // ── Marketing deliverables ───────────────────────────────────────────────
  // Only products that have REACHED the marketing stage are "due" — products
  // still in design/sampling/BOM aren't delayed on marketing, they just aren't there yet.
  const MKT_STAGES = ['marketing_ready', 'sales_priced', 'product_live']
  const mktEligible  = productMetrics.filter(pm => MKT_STAGES.includes(pm.stage))
  const mktCompleted = productMetrics.filter(pm => pm.mktPhotoshoot).length
  const mktCatalog   = productMetrics.filter(pm => pm.mktCatalog).length
  const mktLaunch    = productMetrics.filter(pm => pm.mktLaunchCreative).length
  const mktDone      = productMetrics.filter(pm => pm.stage === 'marketing_ready' || pm.status === 'completed').length

  const pending = (done: number) => Math.max(0, mktEligible.length - done)
  const marketingDeliverables = [
    { label: 'Photoshoot',     completed: mktCompleted, delayed: pending(mktCompleted) },
    { label: 'A+ / Catalog',  completed: mktCatalog,   delayed: pending(mktCatalog)   },
    { label: 'Launch Deck',   completed: mktLaunch,    delayed: pending(mktLaunch)     },
    { label: 'Final Approval', completed: mktDone,     delayed: pending(mktDone)       },
  ]

  // Per-product marketing deliverable rows — only products that have ACTUAL marketing
  // work (at marketing stage AND at least one deliverable started or updatedBy set)
  const mktDeliverableRows: MktDeliverableRow[] = productMetrics
    .filter(pm => MKT_STAGES.includes(pm.stage) && (pm.mktPhotoshoot || pm.mktCatalog || pm.mktLaunchCreative || pm.mktUpdatedBy !== null || pm.marketingDays > 0))
    .map(pm => ({
    productId:       pm.id,
    productName:     pm.name,
    photoshoot:      pm.mktPhotoshoot,
    catalog:         pm.mktCatalog,
    launchCreative:  pm.mktLaunchCreative,
    isCompleted:     mktDone > 0 && (pm.stage === 'marketing_ready' || pm.status === 'completed'),
    daysInMarketing: pm.marketingDays,
    assignedTo:      pm.mktUpdatedBy ? (profileMap.get(pm.mktUpdatedBy)?.full_name ?? null) : null,
  }))

  // Marketing person stats (from updated_by per product — real)
  const mktPersonMap = new Map<string, { products: string[]; onTime: number }>()
  for (const pm of productMetrics) {
    if (!pm.mktUpdatedBy) continue
    if (!mktPersonMap.has(pm.mktUpdatedBy)) mktPersonMap.set(pm.mktUpdatedBy, { products: [], onTime: 0 })
    const ms = mktPersonMap.get(pm.mktUpdatedBy)!
    ms.products.push(pm.id)
    if (pm.marketingDays <= 7 && pm.marketingDays > 0) ms.onTime++
  }
  let mktRoles: MktRole[] = Array.from(mktPersonMap.entries()).map(([id, ms]) => {
    const name = profileMap.get(id)?.full_name ?? 'Marketing Team'
    const assigned = productMetrics.filter(pm => ms.products.includes(pm.id))
    const avgDays  = assigned.length > 0
      ? Math.round(assigned.reduce((s, pm) => s + pm.marketingDays, 0) / assigned.length * 10) / 10 : 0
    const revisions = ms.products.reduce((s, pid) => s + (mktUpdateCount.get(pid) || 0), 0)
    const score = computeScore(avgDays, 7, 0, 0, ms.onTime, ms.products.length)
    return { role: name, products: ms.products.length, avgDays, revisions, onTime: ms.onTime, score }
  }).sort((a, b) => b.score - a.score)
  // Fallback if no updated_by data
  if (mktRoles.length === 0 && mktStarted.length > 0) {
    mktRoles = [{ role: 'Marketing Team', products: mktStarted.length, avgDays: stageAvgs.marketing, revisions: totalMktRevisions, onTime: mktStarted.filter(pm => pm.marketingDays <= 7).length, score: mktOnTimeRate }]
  }

  const data: MgmtDashboardData = {
    products: productMetrics,
    designerStats,
    jrMerchStats,
    samplerStats,
    bomLog,
    bomExecStats,
    mktRoles,
    mktDeliverableRows,
    marketingDeliverables,
    sampleRejectionReasons,
    stageAvgs,
    summary: {
      total: productMetrics.length,
      avgCycleTime,
      onTimeCount,
      onTrackCount: productMetrics.filter(pm => pm.status === 'completed').length,
      delayedCount: productMetrics.filter(pm => pm.status === 'delayed').length,
      atRiskCount:  productMetrics.filter(pm => pm.status === 'at_risk').length,
      totalReworks,
      avgApprovalRounds: productMetrics.length > 0
        ? Math.round(productMetrics.reduce((s, pm) => s + pm.illustrationRounds, 0) / productMetrics.length * 10) / 10 : 0,
    },
    heads: {
      design: {
        name: designHead?.full_name ?? 'Design Head',
        avgReviewDays: avgDesignReviewDays,
        rejections: rejectedIlloFiles,
        reworks: productMetrics.filter(pm => pm.illustrationRounds > 1).length,
        firstPassRate: designFirstPassRate,
      },
      merch: {
        name: merchHead?.full_name ?? 'Merch Head',
        avgReviewDays: samplingHeadTAT,   // real — null if no reviewed samples yet
        rejections: sampleRejections,
        reworks: sampleRejections,
        firstPassRate: sampleFirstPassRate,
      },
      bom: {
        name: bomExecStats[0]?.name ?? profiles.find(p => p.role === 'bom')?.full_name ?? 'BOM Team',
        approvalRate: bomApprovalRate,        // real — % of products with INV code
        avgReviewDays: bomAvgDays > 0 ? bomAvgDays : null,
      },
      marketing: {
        name: mktHeadProfile?.full_name ?? 'Marketing Head',
        avgReviewDays: stageAvgs.marketing > 0 ? stageAvgs.marketing : null,  // overall stage avg
        revisions: totalMktRevisions,         // real — from activity logs
        onTimeRate: mktOnTimeRate,            // real — % within 7d
        decksSignedOff: mktLaunch,            // real — products with launch_creative set
      },
    },
  }

  return (
    <div>
      <Header
        title="Management Review"
        subtitle={`${productMetrics.length} products · PLM performance across all departments`}
      />
      <div className="p-4 sm:p-6">
        <MgmtDashboard data={data} />
      </div>
    </div>
  )
}

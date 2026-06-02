import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'
import { STAGE_LABELS } from '@/lib/types'

function fmtDate(d: string | null | undefined) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'management'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [
    { data: products },
    { data: designRows },
    { data: designSubmissions },
    { data: samplingRows },
    { data: merchandisingRows },
    { data: activityLogs },
    { data: allProfiles },
  ] = await Promise.all([
    supabase.from('products').select('id, name, workflow_stage, created_at, created_by').order('created_at', { ascending: false }).limit(500),
    supabase.from('design_data').select('product_id, assigned_to'),
    supabase.from('design_submissions').select('product_id, status, created_at, reviewed_at, reviewed_by').order('created_at', { ascending: true }).limit(2000),
    supabase.from('sampling_data').select('product_id, sampler_name, reviewed_at, reviewed_by'),
    supabase.from('merchandising_data').select('product_id, assigned_to'),
    supabase.from('activity_logs').select('product_id, created_at, action, user_id').order('created_at', { ascending: true }).limit(5000),
    supabase.from('profiles').select('id, full_name'),
  ])

  const pMap = new Map<string, string>()
  for (const p of allProfiles || []) pMap.set(p.id, p.full_name)
  const n = (id?: string | null) => (id ? pMap.get(id) || '' : '')

  const designMap = new Map<string, string | null>()
  for (const d of designRows || []) designMap.set(d.product_id, d.assigned_to)
  const sampMap = new Map<string, typeof samplingRows extends (infer T)[] | null ? T : never>()
  for (const s of samplingRows || []) sampMap.set(s.product_id, s)
  const merchMap = new Map<string, string | null>()
  for (const m of merchandisingRows || []) merchMap.set(m.product_id, m.assigned_to)

  type LogEntry = { created_at: string; user_id: string | null }
  const logs: Record<string, Map<string, LogEntry>> = {
    salesCreate: new Map(), salesComplete: new Map(),
    designAssign: new Map(), illUpload: new Map(), illSubmit: new Map(), illApprove: new Map(), designDone: new Map(),
    sampSubmit: new Map(), sampApprove: new Map(), sampDone: new Map(),
    merchAssign: new Map(), merchSubmit: new Map(), merchDone: new Map(),
    bomDone: new Map(),
  }

  const dsFirstSubmit = new Map<string, string>()
  const dsApprove = new Map<string, { at: string; by: string | null }>()
  for (const sub of designSubmissions || []) {
    if (!dsFirstSubmit.has(sub.product_id)) dsFirstSubmit.set(sub.product_id, sub.created_at)
    if (sub.status === 'approved' && !dsApprove.has(sub.product_id))
      dsApprove.set(sub.product_id, { at: sub.reviewed_at || sub.created_at, by: sub.reviewed_by })
  }

  for (const log of activityLogs || []) {
    const pid = log.product_id; if (!pid) continue
    const a = (log.action || '').toLowerCase()
    const e: LogEntry = { created_at: log.created_at, user_id: log.user_id }
    if (a.includes('created product with sales') && !logs.salesCreate.has(pid))   logs.salesCreate.set(pid, e)
    if (a.includes('marked sales complete')      && !logs.salesComplete.has(pid)) logs.salesComplete.set(pid, e)
    if (a.startsWith('assigned design to')       && !logs.designAssign.has(pid))  logs.designAssign.set(pid, e)
    if (a.startsWith('uploaded') && a.includes('illustration') && !logs.illUpload.has(pid)) logs.illUpload.set(pid, e)
    if (a.includes('submitted design illustrations') && !logs.illSubmit.has(pid)) logs.illSubmit.set(pid, e)
    if (a.includes('design submission approved') && !logs.illApprove.has(pid))    logs.illApprove.set(pid, e)
    if (a.includes('marked design complete')     && !logs.designDone.has(pid))    logs.designDone.set(pid, e)
    if (a.includes('marked sample complete')     && !logs.sampSubmit.has(pid))    logs.sampSubmit.set(pid, e)
    if (a.includes('management approved sample') && !logs.sampApprove.has(pid))   logs.sampApprove.set(pid, e)
    if (a.includes('sampling complete') && a.includes('stage advanced') && !logs.sampDone.has(pid)) logs.sampDone.set(pid, e)
    if (a.startsWith('assigned merchandising')   && !logs.merchAssign.has(pid))   logs.merchAssign.set(pid, e)
    if (a.includes('submitted attribute sheet')  && !logs.merchSubmit.has(pid))   logs.merchSubmit.set(pid, e)
    if (a.includes('marked merchandising complete') && !logs.merchDone.has(pid))  logs.merchDone.set(pid, e)
    if (a.includes('marked bom complete')        && !logs.bomDone.has(pid))       logs.bomDone.set(pid, e)
  }

  const rows = (products || []).map(p => {
    const pid = p.id
    const samp = sampMap.get(pid)
    const dsa = dsApprove.get(pid)
    const stage = STAGE_LABELS[p.workflow_stage as keyof typeof STAGE_LABELS] || p.workflow_stage

    return {
      'Product Name':             p.name,
      'Current Stage':            stage,
      'Started (Created)':        fmtDate(p.created_at),
      // Sales
      'Sales: Created By':        n(logs.salesCreate.get(pid)?.user_id || p.created_by),
      'Sales: Created Date':      fmtDate(logs.salesCreate.get(pid)?.created_at),
      'Sales: Sent to Design':    fmtDate(logs.salesComplete.get(pid)?.created_at),
      'Sales: Sent By':           n(logs.salesComplete.get(pid)?.user_id),
      // Design
      'Design: Assigned To':      n(designMap.get(pid)),
      'Design: Assigned By':      n(logs.designAssign.get(pid)?.user_id),
      'Design: Assigned Date':    fmtDate(logs.designAssign.get(pid)?.created_at),
      'Design: Illustrations Uploaded': fmtDate(logs.illUpload.get(pid)?.created_at),
      'Design: Sent for Review':  fmtDate(dsFirstSubmit.get(pid)),
      'Design: Illustrations Approved By': n(dsa?.by || logs.illApprove.get(pid)?.user_id),
      'Design: Illustrations Approved Date': fmtDate(dsa?.at),
      'Design: Completed Date':   fmtDate(logs.designDone.get(pid)?.created_at),
      'Design: Completed By':     n(logs.designDone.get(pid)?.user_id),
      // Sampling
      'Sampling: Sampler Name':   samp?.sampler_name || '',
      'Sampling: Sample Submitted Date': fmtDate(logs.sampSubmit.get(pid)?.created_at),
      'Sampling: Sample Submitted By':   n(logs.sampSubmit.get(pid)?.user_id),
      'Sampling: Approved By Management': n(logs.sampApprove.get(pid)?.user_id || samp?.reviewed_by),
      'Sampling: Approval Date':  fmtDate(logs.sampApprove.get(pid)?.created_at || samp?.reviewed_at),
      'Sampling: Completed Date': fmtDate(logs.sampDone.get(pid)?.created_at),
      // Merchandising
      'Merch: Assigned To':       n(merchMap.get(pid)),
      'Merch: Assigned By':       n(logs.merchAssign.get(pid)?.user_id),
      'Merch: Assigned Date':     fmtDate(logs.merchAssign.get(pid)?.created_at),
      'Merch: Submitted Date':    fmtDate(logs.merchSubmit.get(pid)?.created_at),
      'Merch: Completed Date':    fmtDate(logs.merchDone.get(pid)?.created_at),
      'Merch: Completed By':      n(logs.merchDone.get(pid)?.user_id),
      // BOM
      'BOM: Completed Date':      fmtDate(logs.bomDone.get(pid)?.created_at),
      'BOM: Completed By':        n(logs.bomDone.get(pid)?.user_id),
    }
  })

  const ws = XLSX.utils.json_to_sheet(rows)

  // Auto column widths
  const colWidths = Object.keys(rows[0] || {}).map(key => ({
    wch: Math.max(key.length, ...rows.map(r => String((r as Record<string, string>)[key] || '').length)) + 2
  }))
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Product Pipeline')

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const today = new Date().toISOString().slice(0, 10)

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="product-pipeline-${today}.xlsx"`,
      'Cache-Control': 'private, no-store',
    },
  })
}

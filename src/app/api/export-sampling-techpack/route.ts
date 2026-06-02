import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BLUE  = 'FF1E3A8A'
const LBLUE = 'FFdbeafe'
const GRAY  = 'FFF9FAFB'
const LGRAY = 'FF6B7280'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const productId = request.nextUrl.searchParams.get('product_id')
  if (!productId) return NextResponse.json({ error: 'Missing product_id' }, { status: 400 })

  const [{ data: product }, { data: design }, { data: sampling }, { data: sampleFiles }] = await Promise.all([
    adminSupabase.from('products').select('name, category, brand, sub_category').eq('id', productId).single(),
    adminSupabase.from('design_data').select('*').eq('product_id', productId).single(),
    adminSupabase.from('sampling_data').select('*, reviewer:profiles!reviewed_by(full_name)').eq('product_id', productId).single(),
    adminSupabase.from('product_files').select('name, file_url, file_type').eq('product_id', productId).eq('department', 'sampling').order('created_at', { ascending: true }),
  ])

  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const wb = new ExcelJS.Workbook()
  wb.creator = 'HSCVPL PLM'
  wb.created = new Date()

  // ── Helper functions ──────────────────────────────────────────────────────
  function addTitleRow(ws: ExcelJS.Worksheet, title: string) {
    ws.mergeCells('A1:D1')
    const c = ws.getCell('A1')
    c.value = title
    c.font  = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
    c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.getRow(1).height = 28
    ws.mergeCells('A2:D2')
    ws.getCell('A2').value = `Exported: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
    ws.getCell('A2').font  = { italic: true, color: { argb: LGRAY }, size: 10 }
    ws.getCell('A2').alignment = { horizontal: 'center' }
    ws.getRow(2).height = 18
    ws.getColumn('A').width = 26; ws.getColumn('B').width = 36
    ws.getColumn('C').width = 26; ws.getColumn('D').width = 36
  }

  function secHeader(ws: ExcelJS.Worksheet, row: number, label: string) {
    ws.mergeCells(`A${row}:D${row}`)
    const c = ws.getCell(`A${row}`)
    c.value = label; c.font = { bold: true, size: 11, color: { argb: BLUE } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LBLUE } }
    c.alignment = { indent: 1 }; ws.getRow(row).height = 20
  }

  function dataRow(ws: ExcelJS.Worksheet, rowNum: number, l1: string, v1: string | null | undefined, l2: string, v2: string | null | undefined) {
    const r = ws.getRow(rowNum)
    const border = { style: 'thin' as const, color: { argb: 'FFE5E7EB' } }
    const b = { top: border, bottom: border, left: border, right: border }
    r.getCell(1).value = l1; r.getCell(1).font = { bold: true, color: { argb: 'FF374151' } }; r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } }; r.getCell(1).border = b
    r.getCell(2).value = v1 || '—'; r.getCell(2).border = b
    r.getCell(3).value = l2; r.getCell(3).font = { bold: true, color: { argb: 'FF374151' } }; r.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRAY } }; r.getCell(3).border = b
    r.getCell(4).value = v2 || '—'; r.getCell(4).border = b
    r.height = 18
  }

  // ── Sheet 1: Design Tech Pack ─────────────────────────────────────────────
  if (design) {
    const ws1 = wb.addWorksheet('Design Tech Pack')
    addTitleRow(ws1, `Design Tech Pack — ${product.name}`)
    let r = 3
    secHeader(ws1, r++, 'Product Information')
    dataRow(ws1, r++, 'Product Name', product.name,            'Category',      product.category)
    dataRow(ws1, r++, 'Sub-Category', product.sub_category,    'Brand',         product.brand)
    dataRow(ws1, r++, 'Channel',      design.channel,          'Season / Year', design.season_year)
    dataRow(ws1, r++, 'Designer',     design.designer_name,    'Farma',         design.farma)
    r++; secHeader(ws1, r++, 'Materials')
    dataRow(ws1, r++, 'Fabric',       design.fabric,           'Lining',        design.lining)
    dataRow(ws1, r++, 'Air Mesh',     design.air_mesh,         'Sample Color',  design.sample_color)
    r++; secHeader(ws1, r++, 'Hardware & Trims')
    dataRow(ws1, r++, 'Zipper',       design.zipper,           'Puller',        design.puller)
    dataRow(ws1, r++, '9mm Patta',    design.patta_9mm,        'Patta 1',       design.patta_1)
    dataRow(ws1, r++, 'Patta 2',      design.patta_2,          'Lader Lock',    design.lader_lock)
    r++; secHeader(ws1, r++, 'Branding & Print')
    dataRow(ws1, r++, 'Branding',     design.branding,         'Screen Print',  design.screen_print)
    dataRow(ws1, r++, 'Digital Print',design.digital_print,    'Bartech',       design.bartech)
    r++; secHeader(ws1, r++, 'Additional')
    dataRow(ws1, r++, 'Re-sampling By', design.re_sampling_by, 'Designer Sign', design.designer_sign)
    dataRow(ws1, r++, 'Add On 1',     design.add_on_1,         'Add On 2',      design.add_on_2)
    dataRow(ws1, r++, 'Add On 3',     design.add_on_3,         '',              '')
    if (design.remarks) {
      r++; secHeader(ws1, r++, 'Remarks')
      ws1.mergeCells(`A${r}:D${r}`)
      ws1.getCell(`A${r}`).value = design.remarks
      ws1.getCell(`A${r}`).alignment = { wrapText: true, vertical: 'top' }
      ws1.getRow(r).height = Math.max(20, String(design.remarks).split('\n').length * 16 + 10)
    }
  }

  // ── Sheet 2: Sampling Details ─────────────────────────────────────────────
  const ws2 = wb.addWorksheet('Sampling Details')
  addTitleRow(ws2, `Sampling Details — ${product.name}`)
  let r2 = 3

  const statusLabel: Record<string, string> = {
    not_started: 'Not Started', pending_review: 'Pending Review',
    approved: 'Approved', rejected: 'Rejected',
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reviewer = (sampling as any)?.reviewer as { full_name?: string } | null

  secHeader(ws2, r2++, 'Sampling Information')
  dataRow(ws2, r2++, 'Sampler Name',  sampling?.sampler_name,  'Status', statusLabel[sampling?.sample_review_status ?? 'not_started'] ?? '—')
  dataRow(ws2, r2++, 'Reviewed By',   reviewer?.full_name ?? null, 'Reviewed At',
    sampling?.reviewed_at ? new Date(sampling.reviewed_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null)

  if (sampling?.sampler_remarks) {
    r2++; secHeader(ws2, r2++, 'Sampler Remarks')
    ws2.mergeCells(`A${r2}:D${r2}`)
    ws2.getCell(`A${r2}`).value = sampling.sampler_remarks
    ws2.getCell(`A${r2}`).alignment = { wrapText: true, vertical: 'top' }
    ws2.getRow(r2).height = Math.max(20, String(sampling.sampler_remarks).split('\n').length * 16 + 10)
    r2++
  }

  if (sampling?.designer_feedback) {
    r2++; secHeader(ws2, r2++, 'Feedback')
    ws2.mergeCells(`A${r2}:D${r2}`)
    ws2.getCell(`A${r2}`).value = sampling.designer_feedback
    ws2.getCell(`A${r2}`).alignment = { wrapText: true, vertical: 'top' }
    ws2.getRow(r2).height = Math.max(20, String(sampling.designer_feedback).split('\n').length * 16 + 10)
  }

  // ── Sheet 3: Sample Images ────────────────────────────────────────────────
  const imgFiles = (sampleFiles || []).filter(f => f.file_type?.startsWith('image/'))
  if (imgFiles.length > 0) {
    const ws3 = wb.addWorksheet('Sample Images')
    ws3.mergeCells('A1:C1')
    const t = ws3.getCell('A1')
    t.value = `Sample Images — ${product.name}`; t.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }
    t.alignment = { horizontal: 'center', vertical: 'middle' }; ws3.getRow(1).height = 28
    ws3.getColumn('A').width = 4; ws3.getColumn('B').width = 32; ws3.getColumn('C').width = 32

    for (let i = 0; i < imgFiles.length; i++) {
      const col = i % 2; const rowGroup = Math.floor(i / 2)
      const excelRow = 3 + rowGroup * 14
      const colLetter = col === 0 ? 'B' : 'C'
      for (let ri = excelRow; ri < excelRow + 14; ri++) ws3.getRow(ri).height = 14
      try {
        const res = await fetch(imgFiles[i].file_url); if (!res.ok) continue
        const arrayBuf = await res.arrayBuffer()
        const rawExt = imgFiles[i].file_type?.split('/')[1] || 'jpeg'
        const ext = (['jpeg', 'png', 'gif'].includes(rawExt) ? rawExt : 'jpeg') as 'jpeg' | 'png' | 'gif'
        ws3.addImage(wb.addImage({ buffer: arrayBuf, extension: ext }), {
          tl: { col: col + 1, row: excelRow - 1 }, ext: { width: 180, height: 180 },
        })
      } catch { /* skip */ }
      const nc = ws3.getCell(`${colLetter}${excelRow + 13}`)
      nc.value = imgFiles[i].name; nc.font = { size: 9, color: { argb: LGRAY }, italic: true }
      nc.alignment = { horizontal: 'center', wrapText: true }
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  const safeName = (product.name || 'product').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
  const dateStr  = new Date().toISOString().slice(0, 10)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safeName}_Sampling_${dateStr}.xlsx"`,
    },
  })
}

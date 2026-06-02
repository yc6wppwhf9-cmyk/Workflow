import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const productId = request.nextUrl.searchParams.get('product_id')
  if (!productId) return NextResponse.json({ error: 'Missing product_id' }, { status: 400 })

  // Fetch all data in parallel
  const [{ data: product }, { data: designData }, { data: approvedFiles }] = await Promise.all([
    adminSupabase.from('products').select('name, category, brand').eq('id', productId).single(),
    adminSupabase.from('design_data').select('*').eq('product_id', productId).single(),
    adminSupabase.from('product_files')
      .select('name, file_url, file_type')
      .eq('product_id', productId)
      .eq('department', 'design')
      .eq('review_status', 'approved')
      .order('created_at', { ascending: true }),
  ])

  if (!product || !designData) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  const wb = new ExcelJS.Workbook()
  wb.creator  = 'HSCVPL PLM'
  wb.created  = new Date()

  // ── Sheet 1: Tech Pack ──────────────────────────────────────────────────
  const ws = wb.addWorksheet('Tech Pack')

  // Header row
  ws.mergeCells('A1:D1')
  const titleCell = ws.getCell('A1')
  titleCell.value = `Tech Pack — ${product.name}`
  titleCell.font  = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  titleCell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(1).height = 28

  ws.mergeCells('A2:D2')
  ws.getCell('A2').value = `Exported: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
  ws.getCell('A2').font  = { italic: true, color: { argb: 'FF6B7280' }, size: 10 }
  ws.getCell('A2').alignment = { horizontal: 'center' }
  ws.getRow(2).height = 18

  // Column widths
  ws.getColumn('A').width = 26
  ws.getColumn('B').width = 36
  ws.getColumn('C').width = 26
  ws.getColumn('D').width = 36

  function sectionHeader(row: number, label: string) {
    ws.mergeCells(`A${row}:D${row}`)
    const c = ws.getCell(`A${row}`)
    c.value = label
    c.font  = { bold: true, size: 11, color: { argb: 'FF1E3A8A' } }
    c.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFdbeafe' } }
    c.alignment = { indent: 1 }
    ws.getRow(row).height = 20
  }

  function dataRow(rowNum: number, col1: string, val1: string | null | undefined, col2: string, val2: string | null | undefined) {
    const r = ws.getRow(rowNum)
    r.getCell(1).value = col1
    r.getCell(1).font  = { bold: true, color: { argb: 'FF374151' } }
    r.getCell(1).fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
    r.getCell(2).value = val1 || '—'
    r.getCell(3).value = col2
    r.getCell(3).font  = { bold: true, color: { argb: 'FF374151' } }
    r.getCell(3).fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } }
    r.getCell(4).value = val2 || '—'
    r.height = 18
    // Light border
    for (let c = 1; c <= 4; c++) {
      r.getCell(c).border = {
        top:    { style: 'thin', color: { argb: 'FFE5E7EB' } },
        bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        left:   { style: 'thin', color: { argb: 'FFE5E7EB' } },
        right:  { style: 'thin', color: { argb: 'FFE5E7EB' } },
      }
    }
  }

  let r = 3
  sectionHeader(r++, 'Product Information')
  dataRow(r++, 'Product Name', product.name,          'Category',     product.category)
  dataRow(r++, 'Brand',        product.brand,         'Channel',      designData.channel)
  dataRow(r++, 'Season / Year', designData.season_year, 'Designer',    designData.designer_name)
  dataRow(r++, 'Farma',        designData.farma,      '',             '')

  r++
  sectionHeader(r++, 'Materials')
  dataRow(r++, 'Fabric',       designData.fabric,     'Lining',       designData.lining)
  dataRow(r++, 'Air Mesh',     designData.air_mesh,   'Sample Color', designData.sample_color)

  r++
  sectionHeader(r++, 'Hardware & Trims')
  dataRow(r++, 'Zipper',       designData.zipper,     'Puller',       designData.puller)
  dataRow(r++, '9mm Patta',    designData.patta_9mm,  'Patta 1',      designData.patta_1)
  dataRow(r++, 'Patta 2',      designData.patta_2,    'Lader Lock',   designData.lader_lock)

  r++
  sectionHeader(r++, 'Branding & Print')
  dataRow(r++, 'Branding',     designData.branding,   'Screen Print',  designData.screen_print)
  dataRow(r++, 'Digital Print',designData.digital_print, 'Bartech',   designData.bartech)

  r++
  sectionHeader(r++, 'Additional')
  dataRow(r++, 'Re-sampling By', designData.re_sampling_by, 'Designer Sign', designData.designer_sign)
  dataRow(r++, 'Add On 1',    designData.add_on_1,   'Add On 2',     designData.add_on_2)
  dataRow(r++, 'Add On 3',    designData.add_on_3,   '',             '')

  if (designData.remarks) {
    r++
    sectionHeader(r++, 'Remarks')
    ws.mergeCells(`A${r}:D${r}`)
    const rc = ws.getCell(`A${r}`)
    rc.value = designData.remarks
    rc.alignment = { wrapText: true, vertical: 'top' }
    // 16px per line + 10px padding so no line is clipped
    const lineCount = (designData.remarks as string).split('\n').length
    ws.getRow(r).height = Math.max(20, lineCount * 16 + 10)
    r++
  }

  if (designData.color_skus?.length) {
    r++
    sectionHeader(r++, 'Colour SKUs')
    ws.mergeCells(`A${r}:D${r}`)
    ws.getCell(`A${r}`).value = (designData.color_skus as string[]).join('  |  ')
    ws.getRow(r).height = 18
    r++
  }

  if (designData.unique_feature) {
    r++
    sectionHeader(r++, 'Unique Feature / USP')
    ws.mergeCells(`A${r}:D${r}`)
    const uf = ws.getCell(`A${r}`)
    uf.value = designData.unique_feature
    uf.alignment = { wrapText: true, vertical: 'top' }
    const ufLines = (designData.unique_feature as string).split('\n').length
    ws.getRow(r).height = Math.max(20, ufLines * 16 + 10)
  }

  // ── Sheet 2: Approved Illustrations ────────────────────────────────────
  const imgFiles = (approvedFiles || []).filter(f => f.file_type?.startsWith('image/'))

  if (imgFiles.length > 0) {
    const ws2 = wb.addWorksheet('Approved Illustrations')
    ws2.getColumn('A').width = 4
    ws2.getColumn('B').width = 32
    ws2.getColumn('C').width = 32
    ws2.getColumn('D').width = 32

    ws2.mergeCells('A1:D1')
    const t2 = ws2.getCell('A1')
    t2.value = `Approved Illustrations — ${product.name}`
    t2.font  = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
    t2.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
    t2.alignment = { horizontal: 'center', vertical: 'middle' }
    ws2.getRow(1).height = 28

    const IMG_W = 180  // px
    const IMG_H = 180  // px
    const COLS  = 3
    const COL_LETTERS = ['B', 'C', 'D']

    for (let i = 0; i < imgFiles.length; i++) {
      const col  = i % COLS
      const rowGroup = Math.floor(i / COLS)
      const excelRow = 3 + rowGroup * 14  // 14 rows per image group (~180px)
      const colLetter = COL_LETTERS[col]

      // Set row height for image rows
      for (let ri = excelRow; ri < excelRow + 13; ri++) {
        ws2.getRow(ri).height = 14
      }
      ws2.getRow(excelRow + 13).height = 14  // filename row

      try {
        const res = await fetch(imgFiles[i].file_url)
        if (!res.ok) continue
        const arrayBuf = await res.arrayBuffer()
        const rawExt = imgFiles[i].file_type?.split('/')[1] || 'jpeg'
        const ext = (['jpeg', 'png', 'gif'].includes(rawExt) ? rawExt : 'jpeg') as 'jpeg' | 'png' | 'gif'
        const imgId = wb.addImage({ buffer: arrayBuf, extension: ext })

        ws2.addImage(imgId, {
          tl: { col: COL_LETTERS.indexOf(colLetter) + 1, row: excelRow - 1 },
          ext: { width: IMG_W, height: IMG_H },
        })
      } catch {
        // Skip failed image downloads
      }

      // Filename below image
      const nameCell = ws2.getCell(`${colLetter}${excelRow + 13}`)
      nameCell.value = imgFiles[i].name
      nameCell.font  = { size: 9, color: { argb: 'FF6B7280' }, italic: true }
      nameCell.alignment = { horizontal: 'center', wrapText: true }
    }
  }

  // Serialize and return
  const buffer = await wb.xlsx.writeBuffer()
  const safeName = (product.name || 'product').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
  const dateStr  = new Date().toISOString().slice(0, 10)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safeName}_TechPack_${dateStr}.xlsx"`,
    },
  })
}

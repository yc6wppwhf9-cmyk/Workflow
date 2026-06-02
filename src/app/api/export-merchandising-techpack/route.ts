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
const GREEN = 'FF14532d'
const LGREEN = 'FFdcfce7'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const productId = request.nextUrl.searchParams.get('product_id')
  if (!productId) return NextResponse.json({ error: 'Missing product_id' }, { status: 400 })

  const [{ data: product }, { data: design }, { data: merch }] = await Promise.all([
    adminSupabase.from('products').select('name, category, brand, sub_category').eq('id', productId).single(),
    adminSupabase.from('design_data').select('*').eq('product_id', productId).single(),
    adminSupabase.from('merchandising_data').select('*').eq('product_id', productId).single(),
  ])

  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  const wb = new ExcelJS.Workbook()
  wb.creator = 'HSCVPL PLM'
  wb.created = new Date()

  function addTitleRow(ws: ExcelJS.Worksheet, title: string) {
    ws.mergeCells('A1:D1')
    const c = ws.getCell('A1')
    c.value = title; c.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }; ws.getRow(1).height = 28
    ws.mergeCells('A2:D2')
    ws.getCell('A2').value = `Exported: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
    ws.getCell('A2').font = { italic: true, color: { argb: LGRAY }, size: 10 }
    ws.getCell('A2').alignment = { horizontal: 'center' }; ws.getRow(2).height = 18
    ws.getColumn('A').width = 26; ws.getColumn('B').width = 36
    ws.getColumn('C').width = 26; ws.getColumn('D').width = 36
  }

  function secHeader(ws: ExcelJS.Worksheet, row: number, label: string, color = LBLUE, textColor = BLUE) {
    ws.mergeCells(`A${row}:D${row}`)
    const c = ws.getCell(`A${row}`)
    c.value = label; c.font = { bold: true, size: 11, color: { argb: textColor } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
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

  // ── Sheet 1: Design Tech Pack (reference) ─────────────────────────────────
  if (design) {
    const ws1 = wb.addWorksheet('Design Tech Pack')
    addTitleRow(ws1, `Design Tech Pack — ${product.name}`)
    let r = 3
    secHeader(ws1, r++, 'Product Information')
    dataRow(ws1, r++, 'Product Name',  product.name,            'Category',      product.category)
    dataRow(ws1, r++, 'Sub-Category',  product.sub_category,    'Brand',         product.brand)
    dataRow(ws1, r++, 'Channel',       design.channel,          'Season / Year', design.season_year)
    dataRow(ws1, r++, 'Designer',      design.designer_name,    'Farma',         design.farma)
    r++; secHeader(ws1, r++, 'Materials')
    dataRow(ws1, r++, 'Fabric',        design.fabric,           'Lining',        design.lining)
    dataRow(ws1, r++, 'Air Mesh',      design.air_mesh,         'Sample Color',  design.sample_color)
    r++; secHeader(ws1, r++, 'Hardware & Trims')
    dataRow(ws1, r++, 'Zipper',        design.zipper,           'Puller',        design.puller)
    dataRow(ws1, r++, '9mm Patta',     design.patta_9mm,        'Patta 1',       design.patta_1)
    dataRow(ws1, r++, 'Patta 2',       design.patta_2,          'Lader Lock',    design.lader_lock)
    r++; secHeader(ws1, r++, 'Branding & Print')
    dataRow(ws1, r++, 'Branding',      design.branding,         'Screen Print',  design.screen_print)
    dataRow(ws1, r++, 'Digital Print', design.digital_print,    'Bartech',       design.bartech)
    r++; secHeader(ws1, r++, 'Additional')
    dataRow(ws1, r++, 'Re-sampling By',design.re_sampling_by,   'Designer Sign', design.designer_sign)
    dataRow(ws1, r++, 'Add On 1',      design.add_on_1,         'Add On 2',      design.add_on_2)
    dataRow(ws1, r++, 'Add On 3',      design.add_on_3,         '',              '')
    if (design.remarks) {
      r++; secHeader(ws1, r++, 'Remarks')
      ws1.mergeCells(`A${r}:D${r}`)
      ws1.getCell(`A${r}`).value = design.remarks
      ws1.getCell(`A${r}`).alignment = { wrapText: true, vertical: 'top' }
      ws1.getRow(r).height = Math.max(20, String(design.remarks).split('\n').length * 16 + 10)
    }
  }

  // ── Sheet 2: Merchandising Specs ──────────────────────────────────────────
  const ws2 = wb.addWorksheet('Merchandising Specs')
  addTitleRow(ws2, `Merchandising Specs — ${product.name}`)
  let r2 = 3

  const dims = merch?.dimensions as { length?: string; width?: string; height?: string; unit?: string } | null
  const dimsStr = dims
    ? [dims.length, dims.width, dims.height].filter(Boolean).join(' × ') + (dims.unit ? ` ${dims.unit}` : '')
    : null

  secHeader(ws2, r2++, 'Physical Specs', LGREEN, GREEN)
  dataRow(ws2, r2++, 'Dimensions',         dimsStr,                  'Volume',             merch?.volume)
  dataRow(ws2, r2++, 'Weight',             merch?.weight ? `${merch.weight} g` : null, 'Season Year', merch?.season_year)
  dataRow(ws2, r2++, 'Main Material',      merch?.main_material,     'Material Spec',      merch?.material_spec)

  if (merch?.materials?.length) {
    r2++; secHeader(ws2, r2++, 'Materials', LGREEN, GREEN)
    ws2.mergeCells(`A${r2}:D${r2}`)
    ws2.getCell(`A${r2}`).value = (merch.materials as string[]).join(', ')
    ws2.getRow(r2++).height = 18
  }

  r2++; secHeader(ws2, r2++, 'Compartments & Features', LGREEN, GREEN)
  dataRow(ws2, r2++, 'Compartments',       merch?.compartments,      'Main Compartments',  merch?.main_compartments)
  dataRow(ws2, r2++, 'Pocket Compartments',merch?.pocket_compartments,'Number of Zips',    merch?.number_of_zips)
  dataRow(ws2, r2++, 'Laptop Compartment', merch?.laptop_compartment, 'Bottle Slot',        merch?.bottle_slot)
  dataRow(ws2, r2++, 'Rain Cover',         merch?.rain_cover,         'Back Padded',        merch?.back_padded)
  dataRow(ws2, r2++, 'Color Code',         merch?.color_code,         'Unique Purpose',     merch?.unique_purpose)
  dataRow(ws2, r2++, 'Character Name',     merch?.character_name,     'Theme',              merch?.theme)

  // ── Sheet 3: Colour Variants ──────────────────────────────────────────────
  const variants = (merch?.colour_variants ?? []) as Array<{
    colourTag: string; styleName?: string; weight?: string
    dimensions?: { length?: string; width?: string; height?: string; unit?: string }
    materials?: string[]; uniquePurpose?: string
  }>

  if (variants.length > 0) {
    const ws3 = wb.addWorksheet('Colour Variants')
    ws3.getColumn('A').width = 22; ws3.getColumn('B').width = 28
    ws3.getColumn('C').width = 22; ws3.getColumn('D').width = 28

    ws3.mergeCells('A1:D1')
    const t = ws3.getCell('A1')
    t.value = `Colour Variants — ${product.name}`
    t.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } }
    t.alignment = { horizontal: 'center', vertical: 'middle' }; ws3.getRow(1).height = 28

    let rv = 3
    for (const v of variants) {
      const vDims = v.dimensions
      const vDimsStr = vDims
        ? [vDims.length, vDims.width, vDims.height].filter(Boolean).join(' × ') + (vDims.unit ? ` ${vDims.unit}` : '')
        : null
      secHeader(ws3, rv++, v.colourTag || 'Colour Variant')
      dataRow(ws3, rv++, 'Style Name', v.styleName ?? null, 'Weight', v.weight ? `${v.weight} g` : null)
      dataRow(ws3, rv++, 'Dimensions', vDimsStr, 'Materials', v.materials?.join(', ') ?? null)
      if (v.uniquePurpose) {
        ws3.mergeCells(`A${rv}:D${rv}`)
        ws3.getCell(`A${rv}`).value = v.uniquePurpose
        ws3.getCell(`A${rv}`).alignment = { wrapText: true }
        ws3.getRow(rv).height = 18
        rv++
      }
      rv++
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  const safeName = (product.name || 'product').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40)
  const dateStr  = new Date().toISOString().slice(0, 10)
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safeName}_Merchandising_${dateStr}.xlsx"`,
    },
  })
}

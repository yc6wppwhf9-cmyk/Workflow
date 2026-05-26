import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { STAGE_LABELS, CATEGORY_LABELS, type WorkflowStage, type ProductCategory } from '@/lib/types'

function escape(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function row(cells: (string | number | null | undefined)[]): string {
  return cells.map(escape).join(',')
}

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: products } = await supabase
    .from('products')
    .select('id, name, sku, category, brand, workflow_stage, created_at')
    .order('created_at', { ascending: false })

  if (!products || products.length === 0) {
    return new NextResponse('No products', { status: 404 })
  }

  const ids = products.map(p => p.id)

  const [{ data: bomRows }, { data: designRows }, { data: salesRows }] = await Promise.all([
    supabase.from('bom_data').select('product_id, fg_inv_code, is_completed').in('product_id', ids),
    supabase.from('design_data').select('product_id, designer_name, channel, is_completed').in('product_id', ids),
    supabase.from('sales_data').select('product_id, mrp, dealer_pricing, launch_date, is_completed').in('product_id', ids),
  ])

  const bomMap = Object.fromEntries((bomRows || []).map(b => [b.product_id, b]))
  const designMap = Object.fromEntries((designRows || []).map(d => [d.product_id, d]))
  const salesMap = Object.fromEntries((salesRows || []).map(s => [s.product_id, s]))

  const headers = [
    'Product Name', 'SKU', 'Category', 'Brand', 'Channel', 'Designer',
    'Workflow Stage', 'FG INV Code', 'MRP (₹)', 'Dealer Price (₹)',
    'Launch Date', 'Design Complete', 'Created Date',
  ]

  const lines = [headers.join(',')]

  for (const p of products) {
    const bom = bomMap[p.id]
    const design = designMap[p.id]
    const sales = salesMap[p.id]
    lines.push(row([
      p.name,
      p.sku,
      CATEGORY_LABELS[p.category as ProductCategory] || p.category,
      p.brand,
      design?.channel,
      design?.designer_name,
      STAGE_LABELS[p.workflow_stage as WorkflowStage] || p.workflow_stage,
      bom?.fg_inv_code,
      sales?.mrp,
      sales?.dealer_pricing,
      sales?.launch_date,
      design?.is_completed ? 'Yes' : 'No',
      new Date(p.created_at).toLocaleDateString('en-IN'),
    ]))
  }

  const csv = lines.join('\n')
  const filename = `PLM_Products_${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}

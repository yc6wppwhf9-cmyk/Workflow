import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

interface Item {
  inv_code?: string
  inv_name?: string
  unit?: string
  excel_name?: string
  [k: string]: unknown
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

// Re-point every already-imported BOM line at the current item master.
//
// Names were copied out of the master at import time, so rows imported against
// a stale master keep the old name forever — and keep showing a mismatch flag
// against the Excel even after the master is corrected. This walks bom_data and
// merchandising_data, and for every line whose inv_code exists in the master,
// rewrites inv_name/unit from the master. The excel_name flag is cleared when
// the Excel and the master now agree, and re-raised when they still don't.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (!['admin', 'bom', 'bom_head'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Only the BOM team can re-sync item names' }, { status: 403 })
  }

  const [{ data: bomRows }, { data: merchRows }] = await Promise.all([
    adminSupabase.from('bom_data').select('product_id, items'),
    adminSupabase.from('merchandising_data').select('product_id, colour_variants'),
  ])

  // Collect every code referenced anywhere, then pull just those from the
  // master — the full table is far too large to load in one request.
  const codes = new Set<string>()
  for (const r of bomRows ?? []) {
    for (const it of (r.items as Item[] | null) ?? []) if (it?.inv_code) codes.add(String(it.inv_code).trim())
  }
  for (const r of merchRows ?? []) {
    for (const v of (r.colour_variants as { bomItems?: Item[] }[] | null) ?? []) {
      for (const it of v?.bomItems ?? []) if (it?.inv_code) codes.add(String(it.inv_code).trim())
    }
  }

  const master = new Map<string, { item_name: string; uom: string }>()
  const codeList = [...codes]
  for (let i = 0; i < codeList.length; i += 500) {
    const { data, error } = await adminSupabase
      .from('item_master')
      .select('inv_code, item_name, uom')
      .in('inv_code', codeList.slice(i, i + 500))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const row of data ?? []) {
      master.set(row.inv_code, { item_name: row.item_name ?? '', uom: row.uom ?? '' })
    }
  }

  let renamed = 0

  // Rewrite one line against the master. Returns the line unchanged when the
  // code is unknown, so hand-typed rows are never clobbered.
  function reconcile(it: Item): Item {
    const code = String(it?.inv_code ?? '').trim()
    const m = code ? master.get(code) : undefined
    if (!m || !m.item_name) return it

    // The name the Excel originally carried: excel_name if a mismatch was
    // already recorded, otherwise whatever is stored now.
    const fromExcel = it.excel_name ?? it.inv_name
    const stillDiffers = !!fromExcel && norm(fromExcel) !== norm(m.item_name)

    const next: Item = { ...it, inv_name: m.item_name, unit: m.uom || it.unit }
    if (stillDiffers) next.excel_name = fromExcel
    else delete next.excel_name

    if (norm(it.inv_name) !== norm(next.inv_name) || it.excel_name !== next.excel_name) renamed++
    return next
  }

  const touched = new Set<string>()

  for (const r of bomRows ?? []) {
    const items = (r.items as Item[] | null) ?? []
    if (!items.length) continue
    const before = JSON.stringify(items)
    const next = items.map(reconcile)
    if (JSON.stringify(next) === before) continue
    const { error } = await adminSupabase
      .from('bom_data').update({ items: next }).eq('product_id', r.product_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    touched.add(r.product_id)
  }

  for (const r of merchRows ?? []) {
    const variants = (r.colour_variants as { bomItems?: Item[] }[] | null) ?? []
    if (!variants.length) continue
    const before = JSON.stringify(variants)
    const next = variants.map(v => ({ ...v, bomItems: (v?.bomItems ?? []).map(reconcile) }))
    if (JSON.stringify(next) === before) continue
    const { error } = await adminSupabase
      .from('merchandising_data').update({ colour_variants: next }).eq('product_id', r.product_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    touched.add(r.product_id)
  }

  return NextResponse.json({ ok: true, products: touched.size, renamed })
}

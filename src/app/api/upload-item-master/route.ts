import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET: return how many items are currently in the item_master table
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ count: 0 })
  const { count } = await supabase.from('item_master').select('*', { count: 'exact', head: true })
  return NextResponse.json({ count: count ?? 0 })
}

interface ItemRow {
  inv_code: string
  item_name: string
  item_name_norm: string
  uom: string
}

// POST: write one batch of a master import.
//
// The browser parses the spreadsheet and posts the rows here in batches, all
// tagged with the same import_batch id. Rows are keyed on inv_code, so an item
// whose NAME changed updates in place instead of becoming a second row.
//
// The final batch sets prune=true: every row not written by this import is
// deleted, which turns "Replace Item Master" into an actual replace. Pruning
// only happens once all batches have landed, so a failed upload leaves the
// existing master intact rather than half-wiped.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Only an admin can replace the item master' }, { status: 403 })
  }

  const { items, import_batch, prune } = await req.json() as {
    items?: ItemRow[]; import_batch?: string; prune?: boolean
  }

  if (!import_batch || !/^[A-Za-z0-9-]{8,64}$/.test(import_batch)) {
    return NextResponse.json({ error: 'Invalid import_batch' }, { status: 400 })
  }

  let written = 0
  if (items?.length) {
    const rows = items
      .map(r => ({
        inv_code: String(r.inv_code ?? '').trim(),
        item_name: String(r.item_name ?? '').trim(),
        item_name_norm: String(r.item_name ?? '').trim().toLowerCase().replace(/\s+/g, ' '),
        uom: String(r.uom ?? '').trim(),
        import_batch,
      }))
      .filter(r => r.inv_code && r.item_name_norm)

    if (rows.length) {
      const { error } = await adminSupabase
        .from('item_master')
        .upsert(rows, { onConflict: 'inv_code' })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      written = rows.length
    }
  }

  let removed = 0
  if (prune) {
    const { count, error } = await adminSupabase
      .from('item_master')
      .delete({ count: 'exact' })
      .or(`import_batch.is.null,import_batch.neq.${import_batch}`)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    removed = count ?? 0
  }

  return NextResponse.json({ ok: true, written, removed })
}

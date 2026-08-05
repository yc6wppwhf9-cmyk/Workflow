import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { normaliseRange, formatRangeName, nextSequence } from '@/lib/product-naming'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Assign a rangewise name: "<RANGE> <NNN>".
//
// The range defaults to the product's family_name, which is already captured at
// creation — so in the common case the caller just posts a product_id.
//
// Writing product_range is what marks the name as deliberate: the tech pack and
// merchandising Excel importers check it and refuse to rename a product that has
// one. See canAutoRename in @/lib/product-naming.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()

  // Same set that may rename a product via /api/update-product-name.
  if (!['admin', 'marketing', 'marketing_head', 'bom', 'bom_head'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { product_id, range: rangeInput } = await req.json() as {
    product_id?: string; range?: string
  }
  if (!product_id) return NextResponse.json({ error: 'Missing product_id' }, { status: 400 })

  const { data: product, error: prodErr } = await adminSupabase
    .from('products')
    .select('id, name, family_name, product_range, range_seq')
    .eq('id', product_id)
    .single()
  if (prodErr || !product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  // Explicit range wins; otherwise fall back to what the product already has,
  // then to the family it was created under.
  const range = normaliseRange(
    rangeInput || (product as { product_range?: string }).product_range || product.family_name,
  )
  if (!range) {
    return NextResponse.json(
      { error: 'No range to name from. Set a range (or the product\'s family name) first.' },
      { status: 400 },
    )
  }

  // Already numbered in this same range — nothing to allocate.
  const currentRange = normaliseRange((product as { product_range?: string }).product_range)
  const currentSeq = (product as { range_seq?: number | null }).range_seq
  if (currentRange === range && currentSeq) {
    return NextResponse.json({
      ok: true, name: formatRangeName(range, currentSeq), range, seq: currentSeq, unchanged: true,
    })
  }

  // Allocate the lowest free number in the range. The unique index on
  // (upper(product_range), range_seq) is the real guard — two people naming into
  // the same range at once will collide there, so retry on that.
  const MAX_ATTEMPTS = 5
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: siblings, error: sibErr } = await adminSupabase
      .from('products')
      .select('id, product_range, range_seq')
      .not('product_range', 'is', null)
      .ilike('product_range', range)
    if (sibErr) return NextResponse.json({ error: sibErr.message }, { status: 500 })

    const taken = (siblings ?? [])
      .filter(s => s.id !== product_id && normaliseRange(s.product_range) === range)
      .map(s => s.range_seq as number)
      .filter((n): n is number => typeof n === 'number')

    const seq = nextSequence(taken)
    const name = formatRangeName(range, seq)

    const { error: updErr } = await adminSupabase
      .from('products')
      .update({ name, product_range: range, range_seq: seq, updated_by: user.id })
      .eq('id', product_id)

    if (!updErr) {
      await adminSupabase.from('activity_logs').insert({
        product_id,
        user_id: user.id,
        department: profile?.role ?? 'admin',
        action: `named product "${name}" (range ${range}, no. ${seq})`,
        field_changed: 'name',
        old_value: product.name ?? null,
        new_value: name,
      })
      return NextResponse.json({ ok: true, name, range, seq })
    }

    // 23505 = unique_violation: someone took this number between our read and
    // write. Loop and pick the next one.
    const isRace = updErr.code === '23505'
    if (!isRace) return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  return NextResponse.json(
    { error: `Could not allocate a number in range "${range}" — too many concurrent updates. Try again.` },
    { status: 409 },
  )
}

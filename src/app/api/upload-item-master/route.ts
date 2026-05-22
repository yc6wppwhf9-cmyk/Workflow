import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

function normalizeItemName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { count } = await supabase.from('item_master').select('*', { count: 'exact', head: true })
  return NextResponse.json({ count: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as string[][]

  // Find header row (the row that contains 'ARTICLE CODE')
  let headerRowIdx = -1
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].some(c => String(c).trim() === 'ARTICLE CODE')) {
      headerRowIdx = i
      break
    }
  }
  if (headerRowIdx < 0) return NextResponse.json({ error: 'ARTICLE CODE column not found in file' }, { status: 400 })

  const headers = rows[headerRowIdx]
  const articleCodeIdx = headers.findIndex(h => String(h).trim() === 'ARTICLE CODE')
  const itemNameIdx = headers.findIndex(h => String(h).trim() === 'ITEM NAME')
  const uomIdx = headers.findIndex(h => String(h).trim() === 'UOM')

  const dataRows = rows
    .slice(headerRowIdx + 1)
    .map(r => ({
      inv_code: String(r[articleCodeIdx] ?? '').trim(),
      item_name: String(r[itemNameIdx] ?? '').trim(),
      item_name_norm: normalizeItemName(String(r[itemNameIdx] ?? '')),
      uom: uomIdx >= 0 ? String(r[uomIdx] ?? '').trim() : '',
    }))
    .filter(r => r.inv_code && r.item_name_norm)

  if (dataRows.length === 0) return NextResponse.json({ error: 'No valid rows found' }, { status: 400 })

  // Delete all existing rows then re-insert
  await supabase.from('item_master').delete().not('id', 'is', null)

  const BATCH = 1000
  let inserted = 0
  for (let i = 0; i < dataRows.length; i += BATCH) {
    const { error } = await supabase.from('item_master').insert(dataRows.slice(i, i + BATCH))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    inserted += Math.min(BATCH, dataRows.length - i)
  }

  return NextResponse.json({ success: true, count: inserted })
}

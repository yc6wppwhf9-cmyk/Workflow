import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: return how many items are currently in the item_master table
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ count: 0 })
  const { count } = await supabase.from('item_master').select('*', { count: 'exact', head: true })
  return NextResponse.json({ count: count ?? 0 })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { file_id, colour_tag } = await req.json() as {
    file_id: string
    colour_tag: string | null
  }

  if (!file_id) return NextResponse.json({ error: 'Missing file_id' }, { status: 400 })

  const { error } = await supabase
    .from('product_files')
    .update({ colour_tag })
    .eq('id', file_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

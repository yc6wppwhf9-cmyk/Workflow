import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

const adminSupabase = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const BUCKET = 'product-files'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { folder, filename } = await req.json() as { folder: string; filename: string }
  if (!filename) return NextResponse.json({ error: 'Missing filename' }, { status: 400 })

  const ext  = (filename.split('.').pop() || 'bin').toLowerCase()
  const safe = folder?.replace(/[^a-zA-Z0-9_/-]/g, '_').slice(0, 200) || 'products'
  const path = `${safe}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const { data, error } = await adminSupabase.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = adminSupabase.storage.from(BUCKET).getPublicUrl(path)

  return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path, publicUrl })
}

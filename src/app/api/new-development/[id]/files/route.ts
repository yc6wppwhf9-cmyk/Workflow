import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: dev } = await supabase
    .from('new_developments')
    .select('created_by, status')
    .eq('id', id)
    .single()

  if (!dev) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (dev.created_by !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (dev.status !== 'draft') return NextResponse.json({ error: 'Cannot add files to a sent development' }, { status: 400 })

  const { name, file_url, file_type, file_size, category } = await request.json()

  // Insert via the service client — the ndf_insert RLS policy doesn't include the
  // merchandising roles on every environment, which blocked merch-head uploads.
  // Ownership + draft status are already verified above.
  const { data: file, error } = await adminSupabase
    .from('new_development_files')
    .insert({ development_id: id, name, file_url, file_type, file_size, category: category || 'other', uploaded_by: user.id })
    .select('id, name, file_url, file_type, file_size, category, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ file })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendPushToRole } from '@/lib/push'
import { APP_URL } from '@/lib/email'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { product_id, product_name, uploader_name, file_count } = await request.json() as {
    product_id: string
    product_name: string
    uploader_name: string
    file_count: number
  }

  if (!product_id) return NextResponse.json({ ok: true, skipped: true })

  const message = `${uploader_name} uploaded ${file_count} illustration${file_count !== 1 ? 's' : ''} for "${product_name}" — management review required.`
  const productUrl = `${APP_URL}/products/${product_id}?tab=design`

  const { data: managers } = await adminSupabase
    .from('profiles')
    .select('id')
    .eq('role', 'management')
    .eq('is_active', true)

  if (!managers || managers.length === 0) return NextResponse.json({ ok: true, skipped: 'no managers' })

  await Promise.all([
    adminSupabase.from('notifications').insert(
      managers.map(m => ({ user_id: m.id, product_id, product_name, message }))
    ),
    sendPushToRole('management', {
      title: 'Illustrations Need Review',
      body:  message,
      url:   productUrl,
      tag:   `mgmt-review-${product_id}`,
    }),
  ])

  return NextResponse.json({ ok: true })
}

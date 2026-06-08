import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendEmail, emailLayout, greeting, btn, badge, infoTable, infoRow, APP_URL } from '@/lib/email'
import { sendPushToRole } from '@/lib/push'

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

  const message = `${uploader_name} uploaded ${file_count} illustration${file_count !== 1 ? 's' : ''} for "${product_name}" — ready for your review.`
  const productUrl = `${APP_URL}/products/${product_id}?tab=design`

  const { data: designHeads } = await adminSupabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('role', 'design_head')
    .eq('is_active', true)

  if (!designHeads || designHeads.length === 0) return NextResponse.json({ ok: true, skipped: 'no design heads' })

  await Promise.all([
    adminSupabase.from('notifications').insert(
      designHeads.map(dh => ({ user_id: dh.id, product_id, product_name, message }))
    ),
    sendPushToRole('design_head', {
      title: 'Illustrations Uploaded for Review',
      body:  message,
      url:   productUrl,
      tag:   `illo-uploaded-${product_id}`,
    }),
    ...designHeads.map(dh => {
      const html = emailLayout(`
        ${greeting(dh.full_name)}
        <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
          A designer has uploaded illustrations that need your review and approval.
        </p>
        ${badge('Illustrations Awaiting Review', '#fef3c7', '#92400e')}
        ${infoTable(
          infoRow('Product',     product_name) +
          infoRow('Uploaded by', uploader_name) +
          infoRow('Files',       `${file_count} illustration${file_count !== 1 ? 's' : ''}`)
        )}
        ${btn('Review Illustrations', productUrl)}
      `)
      return sendEmail(
        dh.email,
        `Illustrations for Review: "${product_name}" by ${uploader_name}`,
        html,
      )
    }),
  ])

  return NextResponse.json({ ok: true })
}

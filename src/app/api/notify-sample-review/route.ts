import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/push'
import { sendEmail, emailLayout, greeting, btn, badge, infoTable, infoRow, APP_URL } from '@/lib/email'
import { SAMPLE_APPROVER_EMAIL } from '@/lib/types'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Notifies the designated sample approver (Amrita) that a sample is waiting for review.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { product_id, product_name } = await request.json() as {
    product_id: string
    product_name: string
  }
  if (!product_id) return NextResponse.json({ ok: true, skipped: true })

  const { data: approver } = await adminSupabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('email', SAMPLE_APPROVER_EMAIL)
    .eq('is_active', true)
    .maybeSingle()

  if (!approver) return NextResponse.json({ ok: true, skipped: 'no approver' })

  const name = product_name || 'a product'
  const message = `A sample for "${name}" is ready for your approval.`
  const reviewUrl = `${APP_URL}/sample-approval`

  await Promise.allSettled([
    adminSupabase.from('notifications').insert({
      user_id: approver.id, product_id, product_name: name, message,
    }),
    sendPushToUser(approver.id, {
      title: 'Sample Ready for Approval',
      body:  message,
      url:   reviewUrl,
      tag:   `sample-review-${product_id}`,
    }),
    sendEmail(
      approver.email,
      `Sample Awaiting Approval: "${name}"`,
      emailLayout(`
        ${greeting(approver.full_name)}
        <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
          A physical sample has been submitted and is waiting for your approval.
        </p>
        ${badge('Approval Required', '#fef3c7', '#92400e')}
        ${infoTable(infoRow('Product', name))}
        ${btn('Open Sample Approval', reviewUrl)}
      `),
    ),
  ])

  return NextResponse.json({ ok: true })
}

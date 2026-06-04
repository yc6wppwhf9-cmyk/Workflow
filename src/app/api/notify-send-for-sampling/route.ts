import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendEmail, emailLayout, greeting, btn, badge, infoTable, infoRow, divider, APP_URL } from '@/lib/email'
import { sendPushToUser } from '@/lib/push'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { product_id, product_name, approved_count, sender_name } = await req.json() as {
    product_id: string
    product_name: string
    approved_count: number
    sender_name: string
  }

  if (!product_id || !product_name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const productUrl = `${APP_URL}/products/${product_id}?tab=sampling`
  const message    = `${approved_count} illustration(s) for "${product_name}" are approved and ready for physical sampling.`

  // Notify all active sampling team members
  const { data: samplingUsers } = await adminSupabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('role', 'sampling')
    .eq('is_active', true)

  if (!samplingUsers || samplingUsers.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no sampling users' })
  }

  // In-app notifications
  await adminSupabase.from('notifications').insert(
    samplingUsers.map(u => ({
      user_id:      u.id,
      product_id,
      product_name,
      message,
    }))
  )

  // Push + email
  await Promise.allSettled(
    samplingUsers.map(async (u) => {
      await sendPushToUser(u.id, {
        title: 'Illustrations Ready for Sampling',
        body:  message,
        url:   productUrl,
        tag:   `send-sampling-${product_id}`,
      })

      const html = emailLayout(`
        ${greeting(u.full_name)}
        <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
          The design team has approved illustrations for the product below and
          they are now ready for you to create physical samples.
        </p>
        ${badge('Ready for Sampling', '#f3e8ff', '#6b21a8')}
        ${infoTable(
          infoRow('Product',            product_name) +
          infoRow('Approved by',        sender_name) +
          infoRow('Illustrations ready', `${approved_count}`)
        )}
        ${divider()}
        <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;">
          Open the product's <strong>Sampling tab</strong> to view the approved illustrations
          and the design tech pack, then upload photos of your physical sample for review.
        </p>
        ${btn('Open Sampling Tab', productUrl)}
      `)

      await sendEmail(
        u.email,
        `Sampling Ready: "${product_name}" — ${approved_count} illustration(s) approved`,
        html,
      )
    })
  )

  return NextResponse.json({ ok: true, notified: samplingUsers.length })
}

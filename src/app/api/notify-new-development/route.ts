import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendEmail, emailLayout, greeting, btn, badge, infoTable, infoRow, APP_URL } from '@/lib/email'
import { sendPushToUser } from '@/lib/push'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: NextRequest) {
  const { development_id, development_title, sender_name } = await request.json()

  // Find all merchandising_head users
  const { data: merchHeads } = await adminSupabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'merchandising_head')
    .eq('is_active', true)

  if (!merchHeads?.length) return NextResponse.json({ ok: true, skipped: true })

  const url  = `${APP_URL}/merch-new-development`
  const message = `New development "${development_title}" has been sent by ${sender_name}.`

  await Promise.all(
    merchHeads.map(async (head) => {
      await adminSupabase.from('notifications').insert({
        user_id:      head.id,
        product_name: development_title,
        message,
      })

      await sendPushToUser(head.id, {
        title: 'New Development Received',
        body:  message,
        url,
        tag:   `new-dev-${development_id}`,
      })

      const html = emailLayout(`
        ${greeting(head.full_name)}
        <p style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.6;">
          A new development has been submitted by <strong>${sender_name}</strong> for your review.
        </p>
        ${badge('New Development', '#fef3c7', '#92400e')}
        ${infoTable(
          infoRow('Title', development_title) +
          infoRow('Submitted By', sender_name)
        )}
        <p style="margin:20px 0 0;color:#475569;font-size:14px;line-height:1.7;">
          Open the New Development tab to view the uploaded files and remarks.
        </p>
        ${btn('View New Development', url)}
      `)

      await sendEmail(head.email, `New Development: "${development_title}"`, html)
    })
  )

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendEmail, emailLayout, btn, badge, infoTable, infoRow, divider } from '@/lib/email'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function POST(request: NextRequest) {
  try {
    const { development_title, recipient_email, sender_name, remarks } = await request.json() as {
      development_title: string
      recipient_email: string
      sender_name: string
      remarks?: string
    }

    if (!recipient_email || !development_title) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const safeSender = escapeHtml(sender_name || 'Merchandising Head')
    const safeTitle  = escapeHtml(development_title)

    const html = emailLayout(`
      <p style="margin:0 0 20px;color:#0f172a;font-size:15px;">Hello,</p>
      <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
        A new development has been created and shared with you by <strong>${safeSender}</strong>.
      </p>
      ${badge('New Development', '#fdf4ff', '#7e22ce')}
      ${infoTable(
        infoRow('Development', development_title) +
        infoRow('Created by', sender_name || '') +
        (remarks ? infoRow('Remarks', remarks) : '')
      )}
      ${divider()}
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;">
        Please review the development and take the necessary action.
      </p>
      ${btn('View Development', `${appUrl}/merch-new-development`)}
    `)

    await sendEmail(
      recipient_email,
      `New Development: "${safeTitle}"`,
      html,
    )

    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('[notify-new-development-email]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

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
    const { product_id, product_name, recipient_email, sender_name } = await request.json() as {
      product_id: string
      product_name: string
      recipient_email: string
      sender_name: string
    }

    if (!product_id || !recipient_email) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const productUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/products/${product_id}`
    const safeSender = escapeHtml(sender_name || 'Merchandising Head')
    const safeProduct = escapeHtml(product_name || 'New Product')

    const html = emailLayout(`
      <p style="margin:0 0 20px;color:#0f172a;font-size:15px;">Hello,</p>
      <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
        A new product has been created and shared with you by <strong>${safeSender}</strong>.
      </p>
      ${badge('New Product', '#f0fdf4', '#15803d')}
      ${infoTable(
        infoRow('Product', product_name || '') +
        infoRow('Created by', sender_name || '')
      )}
      ${divider()}
      <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;">
        Please review the product details and take the necessary action.
      </p>
      ${btn('View Product', productUrl)}
    `)

    await sendEmail(
      recipient_email,
      `New Product: "${safeProduct}"`,
      html,
    )

    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('[notify-product-email]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

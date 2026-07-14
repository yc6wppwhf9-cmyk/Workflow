import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/push'
import { sendEmail, emailLayout, greeting, btn, badge, infoTable, infoRow, divider, APP_URL } from '@/lib/email'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Notifies the assigned designer when the merchandising head leaves a design remark.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()
  if (!['merchandising_head', 'admin'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { product_id, product_name, remark } = await request.json() as {
    product_id: string; product_name: string; remark: string
  }
  if (!product_id || !remark?.trim()) return NextResponse.json({ ok: true, skipped: true })

  // Persist the remark (admin client bypasses design_data RLS for the merch head)
  await adminSupabase
    .from('design_data')
    .update({ merch_remark: remark.trim(), updated_by: user.id })
    .eq('product_id', product_id)

  // Find the assigned designer for this product
  const { data: designData } = await adminSupabase
    .from('design_data')
    .select('assigned_to, designer:profiles!assigned_to(id, full_name, email)')
    .eq('product_id', product_id)
    .single()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const designer = Array.isArray(designData?.designer) ? (designData!.designer as any[])[0] : (designData?.designer as any)
  if (!designer?.id) return NextResponse.json({ ok: true, skipped: 'no designer' })

  const name = product_name || 'a product'
  const fromName = profile?.full_name || 'Merchandising Head'
  const message = `${fromName} left a design remark on "${name}": ${remark.trim()}`
  const productUrl = `${APP_URL}/products/${product_id}?tab=design`

  await Promise.allSettled([
    adminSupabase.from('notifications').insert({
      user_id: designer.id, product_id, product_name: name, message,
    }),
    sendPushToUser(designer.id, {
      title: 'New Design Remark',
      body:  `${fromName}: ${remark.trim()}`,
      url:   productUrl,
      tag:   `design-remark-${product_id}`,
    }),
    designer.email
      ? sendEmail(
          designer.email,
          `Design Remark: "${name}"`,
          emailLayout(`
            ${greeting(designer.full_name)}
            <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
              ${fromName} has left a design-specific remark for you.
            </p>
            ${badge('Design Remark', '#e0e7ff', '#3730a3')}
            ${infoTable(infoRow('Product', name) + infoRow('From', fromName))}
            ${divider()}
            <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;white-space:pre-wrap;">${remark.trim()}</p>
            ${btn('Open Design', productUrl)}
          `),
        )
      : Promise.resolve(),
  ])

  return NextResponse.json({ ok: true })
}

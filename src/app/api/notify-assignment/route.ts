import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendEmail, emailLayout, greeting, btn, badge, infoTable, infoRow, divider, APP_URL } from '@/lib/email'
import { sendPushToUser } from '@/lib/push'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    product_id,
    product_name,
    assigned_to_id,
    assigned_to_name,
    assigned_to_email,
    department,
    assigned_by_name,
  } = await request.json()

  if (!assigned_to_id || !product_id) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const productUrl  = `${APP_URL}/products/${product_id}`
  const deptLabel   = department === 'design' ? 'Design' : 'Merchandising'
  const tabParam    = department === 'design' ? 'design' : 'merchandising'
  const productLink = `${productUrl}?tab=${tabParam}`

  const message = `You have been assigned to work on "${product_name}" — ${deptLabel} stage.`

  // In-app notification
  await adminSupabase.from('notifications').insert({
    user_id:      assigned_to_id,
    product_id,
    product_name,
    message,
  })

  // Push notification
  await sendPushToUser(assigned_to_id, {
    title: `New Task Assigned — ${deptLabel}`,
    body:  message,
    url:   productLink,
    tag:   `assign-${product_id}`,
  })

  // Email
  const html = emailLayout(`
    ${greeting(assigned_to_name)}
    <p style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.6;">
      You have been assigned a new task by <strong>${assigned_by_name}</strong>.
    </p>
    ${badge(deptLabel + ' Task', department === 'design' ? '#ede9fe' : '#ccfbf1', department === 'design' ? '#5b21b6' : '#0f766e')}
    ${infoTable(
      infoRow('Product', product_name) +
      infoRow('Department', deptLabel) +
      infoRow('Assigned by', assigned_by_name)
    )}
    <p style="margin:20px 0 0;color:#475569;font-size:14px;line-height:1.7;">
      Please open the product and complete your work in the <strong>${deptLabel}</strong> tab.
    </p>
    ${btn('Open Product', productLink)}
  `)

  await sendEmail(
    assigned_to_email,
    `Task Assigned: "${product_name}" — ${deptLabel}`,
    html,
  )

  return NextResponse.json({ ok: true })
}

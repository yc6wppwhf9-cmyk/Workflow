import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { STAGE_LABELS, ROLE_LABELS, type WorkflowStage, type UserRole } from '@/lib/types'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Maps each stage to the role(s) that need to act next
const NEXT_STAGE_ROLES: Partial<Record<WorkflowStage, UserRole[]>> = {
  design_completed:         ['design_head'],  // only head is notified; head then assigns to a team member
  sampling_completed:       ['merchandising_head'],
  merchandising_completed:  ['merchandising'],
  bom_finalized:            ['bom'],
  marketing_ready:          ['marketing'],
  sales_priced:             ['admin'],
  product_live:             ['admin'],
}

export async function POST(request: NextRequest) {
  try {
    const { product_id, product_name, next_stage } = await request.json() as {
      product_id: string
      product_name: string
      next_stage: WorkflowStage
    }

    if (!product_id || !next_stage) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createServerClient()

    // Verify caller is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const recipientRoles = NEXT_STAGE_ROLES[next_stage]
    if (!recipientRoles || recipientRoles.length === 0) {
      return NextResponse.json({ skipped: true, reason: 'No recipient roles for this stage' })
    }

    // Fetch all active users for all recipient roles
    const { data: recipients } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .in('role', recipientRoles)
      .eq('is_active', true)

    if (!recipients || recipients.length === 0) {
      return NextResponse.json({ skipped: true, reason: 'No active users for role' })
    }

    const stageLabel = STAGE_LABELS[next_stage]
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'
    const productUrl = `${appUrl}/products/${product_id}`

    // Send via Resend if API key is configured
    const resendKey = process.env.RESEND_API_KEY
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'PLM System <noreply@hscvpl.com>'

    // Always write in-app notifications regardless of email config
    await adminSupabase.from('notifications').insert(
      recipients.map(r => ({
        user_id:      r.id,
        product_id,
        product_name: product_name || null,
        message:      `"${product_name}" has moved to ${stageLabel} — your action is required.`,
      }))
    )

    if (!resendKey) {
      console.log(`[notify] Stage advanced to "${stageLabel}" for "${product_name}". Recipients: ${recipients.map(r => r.email).join(', ')}`)
      return NextResponse.json({ sent: false, reason: 'RESEND_API_KEY not configured', recipients: recipients.length })
    }

    const emailPromises = recipients.map(recipient => {
      const roleLabel = ROLE_LABELS[recipient.role as UserRole] || recipient.role
      const isHead = recipient.role === 'design_head'
      const actionLine = isHead
        ? 'Please review the requirements and assign a designer.'
        : `This product is now awaiting your department's attention.`
      return fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromEmail,
          to: [recipient.email],
          subject: `Action required: "${product_name}" is now at ${stageLabel}`,
          html: `
            <p>Hi ${recipient.full_name} (${roleLabel}),</p>
            <p>The product <strong>${product_name}</strong> has advanced to the <strong>${stageLabel}</strong> stage. ${actionLine}</p>
            <p><a href="${productUrl}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:8px;">Open Product</a></p>
            <p style="color:#6b7280;font-size:12px;margin-top:24px;">HSCVPL Product Lifecycle Management System</p>
          `,
        }),
      })
    })

    await Promise.allSettled(emailPromises)

    return NextResponse.json({ sent: true, recipients: recipients.length })
  } catch (err) {
    console.error('[notify-stage-advance]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

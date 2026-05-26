import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { STAGE_LABELS, type WorkflowStage, type UserRole } from '@/lib/types'

// Maps each stage to the role that needs to act next
const NEXT_STAGE_ROLE: Partial<Record<WorkflowStage, UserRole>> = {
  design_completed:         'merchandising',
  merchandising_completed:  'bom',
  bom_finalized:            'marketing',
  marketing_ready:          'sales',
  sales_priced:             'admin',
  product_live:             'admin',
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

    const supabase = await createClient()

    // Verify caller is authenticated
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const recipientRole = NEXT_STAGE_ROLE[next_stage]
    if (!recipientRole) {
      return NextResponse.json({ skipped: true, reason: 'No recipient role for this stage' })
    }

    // Fetch all active users for the recipient role
    const { data: recipients } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('role', recipientRole)
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

    if (!resendKey) {
      // No email provider — log and return success so the workflow isn't blocked
      console.log(`[notify] Stage advanced to "${stageLabel}" for "${product_name}". Recipients: ${recipients.map(r => r.email).join(', ')}`)
      return NextResponse.json({ sent: false, reason: 'RESEND_API_KEY not configured', recipients: recipients.length })
    }

    const emailPromises = recipients.map(recipient =>
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [recipient.email],
          subject: `Action required: "${product_name}" is now at ${stageLabel}`,
          html: `
            <p>Hi ${recipient.full_name},</p>
            <p>The product <strong>${product_name}</strong> has advanced to the <strong>${stageLabel}</strong> stage and is now awaiting your department's attention.</p>
            <p><a href="${productUrl}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:8px;">Open Product</a></p>
            <p style="color:#6b7280;font-size:12px;margin-top:24px;">HSCVPL Product Lifecycle Management System</p>
          `,
        }),
      })
    )

    await Promise.allSettled(emailPromises)

    return NextResponse.json({ sent: true, recipients: recipients.length })
  } catch (err) {
    console.error('[notify-stage-advance]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

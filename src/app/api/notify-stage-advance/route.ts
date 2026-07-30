import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { STAGE_LABELS, ROLE_LABELS, type WorkflowStage, type UserRole } from '@/lib/types'
import { sendPushToUser } from '@/lib/push'
import { sendEmail, emailLayout, greeting, btn, badge, infoTable, infoRow, divider } from '@/lib/email'
import { buildFileContent } from '@/lib/email-attachments'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Maps each stage to the role(s) that need to act next
const NEXT_STAGE_ROLES: Partial<Record<WorkflowStage, UserRole[]>> = {
  design_completed:         ['design_head'],
  sampling_completed:       ['merchandising_head'],
  merchandising_completed:  ['merchandising'],
  // Only the BOM head is told when work arrives — she assigns it, and the
  // assignee is emailed separately by /api/bom-approval. Notifying the whole
  // BOM team here would spam members about work that isn't theirs.
  bom_finalized:            ['bom_head'],
  marketing_ready:          ['marketing_head'],
  sales_priced:             ['admin'],
  product_live:             ['admin'],
}

// Maps each stage to which department's files to include in the email.
// Marketing and Sales inherit the merchandising uploads: their own departments
// have nothing attached yet at the moment they are notified, so listing only
// their own folder produced an email with no files at all.
const STAGE_FILE_DEPTS: Partial<Record<WorkflowStage, string[]>> = {
  design_completed:         ['design'],
  sampling_completed:       ['sampling'],
  merchandising_completed:  ['merchandising'],
  bom_finalized:            ['merchandising'],
  marketing_ready:          ['merchandising', 'marketing'],
  sales_priced:             ['merchandising', 'marketing'],
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
    const productUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001'}/products/${product_id}`

    const notifMessage = `"${product_name}" has moved to ${stageLabel} — your action is required.`

    // Always write in-app notifications regardless of email config
    await adminSupabase.from('notifications').insert(
      recipients.map(r => ({
        user_id:      r.id,
        product_id,
        product_name: product_name || null,
        message:      notifMessage,
      }))
    )

    // Send push notifications to all recipients
    await Promise.allSettled(
      recipients.map(r => sendPushToUser(r.id, {
        title: 'HSCVPL PLM — Action Required',
        body:  notifMessage,
        url:   productUrl,
        tag:   `stage-${product_id}`,
      }))
    )

    // Fetch files to attach/embed
    const fileDepts = STAGE_FILE_DEPTS[next_stage]
    const { imageHtml, attachments } = fileDepts
      ? await buildFileContent(product_id, fileDepts)
      : { imageHtml: '', attachments: [] }

    const emailPromises = recipients.map(recipient => {
      const roleLabel  = ROLE_LABELS[recipient.role as UserRole] || recipient.role
      const isHead     = recipient.role === 'design_head'
      const actionLine = isHead
        ? 'Please review the uploaded work and assign a designer to proceed.'
        : 'Your department\'s attention is required to move this product forward.'

      const html = emailLayout(`
        ${greeting(recipient.full_name)}
        <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
          A product has advanced to your stage and requires your action.
        </p>
        ${badge(stageLabel, '#dbeafe', '#1e40af')}
        ${infoTable(
          infoRow('Product', product_name) +
          infoRow('Stage', stageLabel) +
          infoRow('Your Role', roleLabel)
        )}
        ${divider()}
        <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;">${actionLine}</p>
        ${imageHtml ? `${divider()}<p style="margin:0 0 10px;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Attached files</p>${imageHtml}` : ''}
        ${btn('Open Product', productUrl)}
      `)

      return sendEmail(
        recipient.email,
        `Action Required: "${product_name}" is now at ${stageLabel}`,
        html,
        attachments.length > 0 ? attachments : undefined,
      )
    })

    await Promise.allSettled(emailPromises)

    return NextResponse.json({ sent: true, recipients: recipients.length })
  } catch (err) {
    console.error('[notify-stage-advance]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

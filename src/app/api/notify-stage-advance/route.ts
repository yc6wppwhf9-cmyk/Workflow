import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { STAGE_LABELS, ROLE_LABELS, type WorkflowStage, type UserRole } from '@/lib/types'
import { sendPushToUser } from '@/lib/push'
import { sendEmail, emailLayout, greeting, btn, badge, infoTable, infoRow, divider } from '@/lib/email'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Maps each stage to the role(s) that need to act next
const NEXT_STAGE_ROLES: Partial<Record<WorkflowStage, UserRole[]>> = {
  design_completed:         ['design_head'],
  sampling_completed:       ['merchandising_head'],
  merchandising_completed:  ['merchandising'],
  bom_finalized:            ['bom'],
  marketing_ready:          ['marketing_head'],
  sales_priced:             ['admin'],
  product_live:             ['admin'],
}

// Maps each stage to which department's files to include in the email
const STAGE_FILE_DEPTS: Partial<Record<WorkflowStage, string[]>> = {
  design_completed:         ['design'],
  sampling_completed:       ['sampling'],
  merchandising_completed:  ['merchandising'],
  bom_finalized:            ['merchandising'],
  marketing_ready:          ['marketing'],
  sales_priced:             ['marketing'],
}

const isCloudinaryUrl = (url: string) => url.startsWith('https://res.cloudinary.com')

async function buildFileContent(product_id: string, depts: string[]): Promise<{
  imageHtml: string
  attachments: { filename: string; content: string; type: string }[]
}> {
  const { data: files } = await adminSupabase
    .from('product_files')
    .select('name, file_url, file_type')
    .eq('product_id', product_id)
    .in('department', depts)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!files || files.length === 0) return { imageHtml: '', attachments: [] }

  const imageFiles = files.filter(f => f.file_type?.startsWith('image/'))
  const otherFiles = files.filter(f => f.file_type && !f.file_type.startsWith('image/'))

  // Resolve image URLs
  const imageUrls: string[] = []
  for (const img of imageFiles.slice(0, 6)) {
    if (isCloudinaryUrl(img.file_url)) {
      imageUrls.push(img.file_url)
    } else {
      const { data: urlData } = await adminSupabase.storage
        .from('product-files')
        .createSignedUrl(img.file_url, 60 * 60 * 24 * 7) // 7 days
      if (urlData?.signedUrl) imageUrls.push(urlData.signedUrl)
    }
  }

  // Download and base64-encode non-image files (Excel, PDFs)
  const attachments: { filename: string; content: string; type: string }[] = []
  for (const file of otherFiles.slice(0, 3)) {
    if (!isCloudinaryUrl(file.file_url)) {
      try {
        const { data: blob } = await adminSupabase.storage
          .from('product-files')
          .download(file.file_url)
        if (blob) {
          const buffer = await blob.arrayBuffer()
          attachments.push({
            filename: file.name,
            content: Buffer.from(buffer).toString('base64'),
            type: file.file_type || 'application/octet-stream',
          })
        }
      } catch {
        // skip failed downloads
      }
    }
  }

  const imageHtml = imageUrls.length > 0 ? `
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;">
      <p style="font-size:12px;font-weight:600;color:#374151;margin:0 0 10px 0;">
        Referenced files (${imageUrls.length} image${imageUrls.length !== 1 ? 's' : ''}${attachments.length > 0 ? ` + ${attachments.length} attachment${attachments.length !== 1 ? 's' : ''}` : ''}):
      </p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;">
        ${imageUrls.map(url =>
          `<img src="${url}" style="width:130px;height:100px;object-fit:cover;border-radius:6px;border:1px solid #e5e7eb;" />`
        ).join('')}
      </div>
    </div>` : ''

  return { imageHtml, attachments }
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

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendEmail, emailLayout, greeting, btn, badge, infoTable, infoRow, divider, APP_URL } from '@/lib/email'
import { sendPushToUser } from '@/lib/push'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: reviewer } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single()

    if (!['admin', 'design_head'].includes(reviewer?.role ?? '')) {
      return NextResponse.json({ error: 'Only design head or admin can review submissions' }, { status: 403 })
    }

    const { status, feedback } = await request.json() as {
      status: 'approved' | 'rejected'
      feedback?: string
    }
    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'status must be approved or rejected' }, { status: 400 })
    }

    // Fetch submission with submitter + product info
    const { data: submission } = await adminSupabase
      .from('design_submissions')
      .select('product_id, submitted_by, submitter:profiles!submitted_by(full_name, email)')
      .eq('id', id)
      .single()

    const { data, error } = await supabase
      .from('design_submissions')
      .update({
        status,
        feedback: feedback || null,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (submission?.product_id) {
      await supabase.from('activity_logs').insert({
        product_id: submission.product_id,
        user_id:    user.id,
        action:     `design submission ${status}${feedback ? `: ${feedback}` : ''}`,
        department: 'design',
      })

      // Fetch product name
      const { data: product } = await adminSupabase
        .from('products')
        .select('name')
        .eq('id', submission.product_id)
        .single()

      const productName  = product?.name || 'Product'
      const productUrl   = `${APP_URL}/products/${submission.product_id}?tab=design`
      const submitter    = Array.isArray(submission.submitter) ? submission.submitter[0] : submission.submitter
      const submitterId  = submission.submitted_by
      const submitterName  = (submitter as { full_name: string } | null)?.full_name || 'Designer'
      const submitterEmail = (submitter as { email: string } | null)?.email

      const isApproved   = status === 'approved'
      const notifMessage = isApproved
        ? `Your design illustrations for "${productName}" have been approved. You can now upload the tech pack.`
        : `Your design illustrations for "${productName}" were rejected${feedback ? `: ${feedback}` : '. Please revise and resubmit.'}`

      // In-app notification
      await adminSupabase.from('notifications').insert({
        user_id:      submitterId,
        product_id:   submission.product_id,
        product_name: productName,
        message:      notifMessage,
      })

      // Push notification
      await sendPushToUser(submitterId, {
        title: isApproved ? '✅ Illustrations Approved' : '❌ Illustrations Rejected',
        body:  notifMessage,
        url:   productUrl,
        tag:   `review-${submission.product_id}`,
      })

      // Email
      if (submitterEmail) {
        const html = emailLayout(`
          ${greeting(submitterName)}
          <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
            Your design illustrations have been reviewed by <strong>${reviewer?.full_name || 'Design Head'}</strong>.
          </p>
          ${badge(
            isApproved ? 'Approved' : 'Rejected',
            isApproved ? '#dcfce7' : '#fee2e2',
            isApproved ? '#15803d' : '#b91c1c'
          )}
          ${infoTable(
            infoRow('Product', productName) +
            infoRow('Status', isApproved ? 'Approved ✓' : 'Rejected ✗') +
            infoRow('Reviewed by', reviewer?.full_name || 'Design Head') +
            (feedback ? infoRow('Feedback', feedback) : '')
          )}
          ${divider()}
          <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;">
            ${isApproved
              ? 'Great work! You can now proceed to upload the <strong>tech pack</strong> for this product.'
              : 'Please revise your illustrations based on the feedback and <strong>resubmit for review</strong>.'}
          </p>
          ${btn('Open Product', productUrl)}
        `)

        await sendEmail(
          submitterEmail,
          `Design ${isApproved ? 'Approved' : 'Rejected'}: "${productName}"`,
          html,
        )
      }
    }

    return NextResponse.json({ submission: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

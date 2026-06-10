import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { sendEmail, emailLayout, greeting, btn, badge, infoTable, infoRow, divider, APP_URL } from '@/lib/email'
import { sendPushToUser, sendPushToRole } from '@/lib/push'

const adminSupabase = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, full_name').eq('id', user.id).single()
  if (!['admin', 'management'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Only management can review samples' }, { status: 403 })
  }

  const { product_id, round_id, status, feedback } = await req.json()
  if (!product_id || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const now = new Date().toISOString()

  // Update the specific round (source of truth)
  if (round_id) {
    const { error: roundErr } = await adminSupabase.from('sampling_rounds').update({
      status,
      feedback: status === 'rejected' ? (feedback || null) : null,
      reviewed_by: user.id,
      reviewed_at: now,
    }).eq('id', round_id)
    if (roundErr) return NextResponse.json({ error: roundErr.message }, { status: 500 })
  }

  // Keep sampling_data in sync for backward-compat dashboards/reports
  const { error } = await adminSupabase.from('sampling_data').update({
    sample_review_status: status,
    designer_feedback: status === 'rejected' ? (feedback || null) : null,
    reviewed_by: user.id,
    reviewed_at: now,
    is_completed: status === 'approved',
    updated_by: user.id,
  }).eq('product_id', product_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Guard: only advance workflow_stage if the product is currently at design_completed.
  // This prevents a late review from regressing a product that has already moved past sampling.
  if (status === 'approved') {
    const { data: currentProduct } = await adminSupabase
      .from('products').select('workflow_stage').eq('id', product_id).single()
    if (currentProduct?.workflow_stage === 'design_completed') {
      const { error: stageErr } = await adminSupabase.from('products')
        .update({ workflow_stage: 'sampling_completed', updated_by: user.id })
        .eq('id', product_id)
      if (stageErr) return NextResponse.json({ error: stageErr.message }, { status: 500 })
    }
  }

  // Fetch round number for the activity log message
  const roundLabel = round_id
    ? await adminSupabase.from('sampling_rounds').select('round_number').eq('id', round_id).single()
        .then(r => r.data?.round_number ? ` (Round ${r.data.round_number})` : '')
    : ''

  await adminSupabase.from('activity_logs').insert({
    product_id,
    user_id: user.id,
    action: status === 'approved'
      ? `management approved sample${roundLabel} — product moved to merchandising stage`
      : `management rejected sample${roundLabel}${feedback ? `: ${feedback}` : ''}`,
    department: 'sampling',
  })

  // ── Notify design team when sample is approved ─────────────────────────
  if (status === 'approved') {
    const [{ data: product }, { data: designData }, { data: designHeads }] = await Promise.all([
      adminSupabase.from('products').select('name').eq('id', product_id).single(),
      adminSupabase.from('design_data')
        .select('assigned_to, designer:profiles!assigned_to(id, full_name, email)')
        .eq('product_id', product_id)
        .single(),
      adminSupabase.from('profiles')
        .select('id, full_name, email')
        .eq('role', 'design_head')
        .eq('is_active', true),
    ])

    const productName   = product?.name || 'Product'
    const productUrl    = `${APP_URL}/products/${product_id}?tab=sampling`
    const reviewerName  = profile?.full_name || 'Management'
    const isApprovedMsg = `The sample for "${productName}" has been approved by management. The product will now move to the Merchandising stage.`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const designer = Array.isArray(designData?.designer) ? (designData.designer as any[])[0] : designData?.designer as any

    // Collect all recipients: assigned designer + all design heads
    const recipients: { id: string; full_name: string; email: string }[] = []
    if (designer?.id && designer?.email) recipients.push(designer)
    for (const head of designHeads || []) {
      if (!recipients.find(r => r.id === head.id)) recipients.push(head as { id: string; full_name: string; email: string })
    }

    // Fetch merchandising head + marketing head to notify them
    const [{ data: merchandisingHeads }, { data: marketingUsers }] = await Promise.all([
      adminSupabase.from('profiles').select('id, full_name, email').eq('role', 'merchandising_head').eq('is_active', true),
      adminSupabase.from('profiles').select('id, full_name, email').eq('role', 'marketing_head').eq('is_active', true),
    ])

    const marketingUrl = `${APP_URL}/marketing`
    const marketingMsg = `The sample for "${productName}" has been approved. Please review the sample images and assign an official product name.`

    await Promise.allSettled([
      // Notify design team
      ...recipients.map(async (r) => {
        await adminSupabase.from('notifications').insert({
          user_id: r.id, product_id, product_name: productName, message: isApprovedMsg,
        })
        await sendPushToUser(r.id, {
          title: '✅ Sample Approved',
          body:  isApprovedMsg,
          url:   productUrl,
          tag:   `sample-approved-${product_id}`,
        })
        const html = emailLayout(`
          ${greeting(r.full_name)}
          <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
            Management has reviewed the sample for this product.
          </p>
          ${badge('Sample Approved', '#dcfce7', '#15803d')}
          ${infoTable(
            infoRow('Product',     productName) +
            infoRow('Reviewed by', reviewerName) +
            infoRow('Next Stage',  'Merchandising')
          )}
          ${divider()}
          <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;">
            The sample has been approved. The product will now move to the <strong>Merchandising</strong> stage.
          </p>
          ${btn('View Product', productUrl)}
        `)
        await sendEmail(r.email, `Sample Approved: "${productName}"`, html)
      }),

      // Notify marketing team
      ...(marketingUsers ?? []).map(async (m) => {
        await adminSupabase.from('notifications').insert({
          user_id: m.id, product_id, product_name: productName, message: marketingMsg,
        })
        const html = emailLayout(`
          ${greeting(m.full_name)}
          <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
            A physical sample has been approved and is ready for your review.
          </p>
          ${badge('Sample Approved — Name Required', '#fef3c7', '#92400e')}
          ${infoTable(
            infoRow('Product',     productName) +
            infoRow('Approved by', reviewerName)
          )}
          ${divider()}
          <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;">
            Please review the sample photos and variant images, then assign an official product name in the Marketing Queue.
          </p>
          ${btn('Open Marketing Queue', marketingUrl)}
        `)
        await sendEmail(m.email, `Sample Approved — Name Needed: "${productName}"`, html)
      }),

      // Notify merchandising head — product is now in their queue
      ...((merchandisingHeads ?? []).map(async (mh) => {
        const merchMsg = `Sample approved for "${productName}" — it is now in your merchandising queue.`
        const merchUrl = `${APP_URL}/products/${product_id}?tab=merchandising`
        await adminSupabase.from('notifications').insert({
          user_id: mh.id, product_id, product_name: productName, message: merchMsg,
        })
        await sendPushToUser(mh.id, {
          title: 'New Product for Merchandising',
          body:  merchMsg,
          url:   merchUrl,
          tag:   `merch-ready-${product_id}`,
        })
      })),

      sendPushToRole('marketing_head', {
        title: 'Sample Approved — Name Required',
        body:  marketingMsg,
        url:   marketingUrl,
        tag:   `marketing-name-${product_id}`,
      }),
    ])
  }

  return NextResponse.json({ success: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendPushToUser, sendPushToRole } from '@/lib/push'
import { sendEmail, emailLayout, greeting, btn, badge, infoTable, infoRow, APP_URL } from '@/lib/email'
import { buildFileContent } from '@/lib/email-attachments'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// BOM approval workflow:
//   action=assign  → head assigns the BOM to a team member
//   action=submit  → assigned member submits their work for approval
//   action=approve → head approves; product advances to Marketing
//   action=reject  → head sends it back to the member with feedback
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()
  const role = profile?.role ?? ''
  const isHead = ['admin', 'bom_head'].includes(role)
  const isMember = role === 'bom'

  const { product_id, action, assignee_id, feedback } = await req.json() as {
    product_id: string; action: 'assign' | 'submit' | 'approve' | 'reject'
    assignee_id?: string; feedback?: string
  }
  if (!product_id || !action) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { data: product } = await adminSupabase
    .from('products').select('name').eq('id', product_id).single()
  const productName = product?.name || 'Product'
  const productUrl = `${APP_URL}/products/${product_id}?tab=bom`

  // The BOM is built from the merchandising upload, so every mail in this
  // workflow carries that sheet — the assignee especially, who previously had to
  // go and find it. Built once per request and reused across recipients.
  const sourceFiles = () => buildFileContent(product_id, ['merchandising'])

  // ── Assign ──────────────────────────────────────────────────────────────
  if (action === 'assign') {
    if (!isHead) return NextResponse.json({ error: 'Only the BOM head can assign' }, { status: 403 })
    const { error } = await adminSupabase.from('bom_data')
      .update({ assigned_to: assignee_id || null, submitted_for_approval: false, updated_by: user.id })
      .eq('product_id', product_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (assignee_id) {
      const { data: assignee } = await adminSupabase
        .from('profiles').select('full_name, email').eq('id', assignee_id).single()
      const msg = `${profile?.full_name || 'BOM head'} assigned the BOM for "${productName}" to you.`
      const { imageHtml, attachments } = await sourceFiles()
      await Promise.allSettled([
        adminSupabase.from('notifications').insert({ user_id: assignee_id, product_id, product_name: productName, message: msg }),
        sendPushToUser(assignee_id, { title: 'BOM Assigned', body: msg, url: productUrl, tag: `bom-assign-${product_id}` }),
        assignee?.email ? sendEmail(assignee.email, `BOM Assigned: "${productName}"`, emailLayout(`
          ${greeting(assignee.full_name)}
          ${badge('BOM Assigned', '#ffedd5', '#9a3412')}
          ${infoTable(infoRow('Product', productName) + infoRow('Assigned by', profile?.full_name || 'BOM head'))}
          <p style="margin:16px 0 0;color:#475569;font-size:14px;line-height:1.7;">
            The merchandising sheet this BOM is built from is attached.
          </p>
          ${imageHtml}
          ${btn('Open BOM', productUrl)}
        `), attachments.length > 0 ? attachments : undefined) : Promise.resolve(),
      ])
    }
    await adminSupabase.from('activity_logs').insert({
      product_id, user_id: user.id, department: 'bom',
      action: assignee_id ? 'assigned BOM to a team member' : 'unassigned BOM',
    })
    return NextResponse.json({ ok: true })
  }

  // ── Submit for approval ─────────────────────────────────────────────────
  if (action === 'submit') {
    if (!isMember && !isHead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { error } = await adminSupabase.from('bom_data')
      .update({ submitted_for_approval: true, submitted_at: new Date().toISOString(), updated_by: user.id })
      .eq('product_id', product_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const msg = `${profile?.full_name || 'BOM team'} submitted the BOM for "${productName}" for your approval.`
    const { data: heads } = await adminSupabase
      .from('profiles').select('id, full_name, email').eq('role', 'bom_head').eq('is_active', true)
    const { imageHtml, attachments } = await sourceFiles()
    await Promise.allSettled([
      ...(heads ?? []).map(h => adminSupabase.from('notifications')
        .insert({ user_id: h.id, product_id, product_name: productName, message: msg })),
      ...(heads ?? []).map(h => h.email ? sendEmail(h.email, `BOM Approval Needed: "${productName}"`, emailLayout(`
        ${greeting(h.full_name)}
        ${badge('Approval Required', '#fef3c7', '#92400e')}
        ${infoTable(infoRow('Product', productName) + infoRow('Submitted by', profile?.full_name || 'BOM team'))}
        <p style="margin:16px 0 0;color:#475569;font-size:14px;line-height:1.7;">
          The merchandising sheet is attached so you can check the BOM against it.
        </p>
        ${imageHtml}
        ${btn('Review BOM', productUrl)}
      `), attachments.length > 0 ? attachments : undefined) : Promise.resolve()),
      sendPushToRole('bom_head', { title: 'BOM Approval Needed', body: msg, url: productUrl, tag: `bom-approve-${product_id}` }),
    ])
    await adminSupabase.from('activity_logs').insert({
      product_id, user_id: user.id, department: 'bom', action: 'submitted BOM for approval',
    })
    return NextResponse.json({ ok: true })
  }

  // ── Approve → advance to Marketing ──────────────────────────────────────
  if (action === 'approve') {
    if (!isHead) return NextResponse.json({ error: 'Only the BOM head can approve' }, { status: 403 })

    // MD costing approval is mandatory before the product can leave BOM.
    // (Naming/range is deliberately NOT required — it can be done later.)
    const { data: costing } = await adminSupabase
      .from('products').select('md_costing_approved').eq('id', product_id).single()
    if (!costing?.md_costing_approved) {
      return NextResponse.json(
        { error: 'MD costing approval is required before sending to Marketing.' },
        { status: 400 },
      )
    }

    const now = new Date().toISOString()
    const { error: bomErr } = await adminSupabase.from('bom_data')
      .update({ is_completed: true, approved_by: user.id, approved_at: now, updated_by: user.id })
      .eq('product_id', product_id)
    if (bomErr) return NextResponse.json({ error: bomErr.message }, { status: 500 })

    const { error: stageErr } = await adminSupabase.from('products')
      .update({ workflow_stage: 'marketing_ready', updated_by: user.id })
      .eq('id', product_id)
    if (stageErr) return NextResponse.json({ error: `stage: ${stageErr.message}` }, { status: 500 })

    // Tell Marketing. The client never called /api/notify-stage-advance after an
    // approval, so the hand-off out of BOM was silent — done here for the same
    // reason the merch hand-off is server-side: a notification the caller can
    // forget to fire is a notification that eventually doesn't happen.
    const marketingMsg = `"${productName}" has been approved by BOM and is now at Marketing.`
    const { data: marketers } = await adminSupabase
      .from('profiles').select('id, full_name, email').eq('role', 'marketing_head').eq('is_active', true)
    const { imageHtml, attachments } = await sourceFiles()
    const marketingUrl = `${APP_URL}/products/${product_id}`
    await Promise.allSettled([
      ...(marketers ?? []).map(m => adminSupabase.from('notifications')
        .insert({ user_id: m.id, product_id, product_name: productName, message: marketingMsg })),
      ...(marketers ?? []).map(m => m.email ? sendEmail(m.email, `Action Required: "${productName}" is now at Marketing`, emailLayout(`
        ${greeting(m.full_name)}
        ${badge('Marketing', '#dbeafe', '#1e40af')}
        ${infoTable(infoRow('Product', productName) + infoRow('Approved by', profile?.full_name || 'BOM head'))}
        <p style="margin:16px 0 0;color:#475569;font-size:14px;line-height:1.7;">
          The BOM is approved and costing is signed off. The merchandising sheet is attached.
        </p>
        ${imageHtml}
        ${btn('Open Product', marketingUrl)}
      `), attachments.length > 0 ? attachments : undefined) : Promise.resolve()),
      sendPushToRole('marketing_head', { title: 'Ready for Marketing', body: marketingMsg, url: marketingUrl, tag: `stage-${product_id}` }),
    ])

    await adminSupabase.from('activity_logs').insert({
      product_id, user_id: user.id, department: 'bom',
      action: 'approved BOM — stage advanced to Marketing',
    })
    return NextResponse.json({ ok: true, advanced: true })
  }

  // ── Reject → back to the member ─────────────────────────────────────────
  if (action === 'reject') {
    if (!isHead) return NextResponse.json({ error: 'Only the BOM head can reject' }, { status: 403 })
    const { data: bom } = await adminSupabase
      .from('bom_data').select('assigned_to').eq('product_id', product_id).single()
    const { error } = await adminSupabase.from('bom_data')
      .update({ submitted_for_approval: false, updated_by: user.id })
      .eq('product_id', product_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const msg = `Your BOM for "${productName}" needs changes${feedback ? `: ${feedback}` : ''}.`
    if (bom?.assigned_to) {
      // Rejection previously sent only an in-app notification and a push, so the
      // one message that carries the head's feedback was the easiest to miss.
      const { data: assignee } = await adminSupabase
        .from('profiles').select('full_name, email').eq('id', bom.assigned_to).single()
      const { imageHtml, attachments } = await sourceFiles()
      await Promise.allSettled([
        adminSupabase.from('notifications').insert({ user_id: bom.assigned_to, product_id, product_name: productName, message: msg }),
        sendPushToUser(bom.assigned_to, { title: 'BOM Sent Back', body: msg, url: productUrl, tag: `bom-reject-${product_id}` }),
        assignee?.email ? sendEmail(assignee.email, `BOM Sent Back: "${productName}"`, emailLayout(`
          ${greeting(assignee.full_name)}
          ${badge('Changes Requested', '#fee2e2', '#991b1b')}
          ${infoTable(
            infoRow('Product', productName) +
            infoRow('Sent back by', profile?.full_name || 'BOM head') +
            (feedback ? infoRow('Feedback', feedback) : '')
          )}
          <p style="margin:16px 0 0;color:#475569;font-size:14px;line-height:1.7;">
            ${feedback ? 'Please make the changes above and submit again.' : 'Please review the BOM and submit again.'}
          </p>
          ${imageHtml}
          ${btn('Open BOM', productUrl)}
        `), attachments.length > 0 ? attachments : undefined) : Promise.resolve(),
      ])
    }
    await adminSupabase.from('activity_logs').insert({
      product_id, user_id: user.id, department: 'bom',
      action: `sent BOM back for changes${feedback ? `: ${feedback}` : ''}`,
    })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

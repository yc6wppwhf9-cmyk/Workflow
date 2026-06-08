import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendEmail, emailLayout, greeting, btn, badge, infoTable, infoRow, divider, APP_URL } from '@/lib/email'
import { sendPushToRole } from '@/lib/push'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function fileLinks(files: { name: string; file_url: string; category: string | null }[], category: string, label: string, color: string): string {
  const list = files.filter(f => f.category === category)
  if (list.length === 0) return ''
  const rows = list.map(f =>
    `<tr>
      <td style="padding:6px 0;">
        <a href="${f.file_url}" target="_blank"
           style="color:#2563eb;text-decoration:none;font-size:13px;font-weight:500;">
          ${f.name}
        </a>
      </td>
    </tr>`
  ).join('')
  return `
    <div style="margin-top:16px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:${color};">${label}</p>
      <table style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:8px;padding:4px 16px;display:table;">
        <tbody>${rows}</tbody>
      </table>
    </div>`
}

export async function POST(request: NextRequest) {
  const {
    development_id,
    development_title,
    design_remarks,
    purchase_remarks,
    merch_sender_name,
    design_sender_name,
    files,
  } = await request.json()

  const { data: purchaseHeads } = await adminSupabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'purchase_head')
    .eq('is_active', true)

  if (!purchaseHeads?.length) return NextResponse.json({ ok: true, skipped: true })

  const url     = `${APP_URL}/purchase-new-development`
  const message = `New development "${development_title}" has been forwarded to you by ${merch_sender_name}.`

  const printLinks = fileLinks(files, 'print', 'Print Files',  '#7c3aed')
  const trimLinks  = fileLinks(files, 'trim',  'Trim Files',   '#0d9488')
  const otherLinks = fileLinks(files, 'other', 'Other Files',  '#475569')

  const allFileLinks = printLinks + trimLinks + otherLinks

  await Promise.all(
    purchaseHeads.map(async (head) => {
      await adminSupabase.from('notifications').insert({
        user_id:      head.id,
        product_name: development_title,
        message,
      })

      await sendPushToRole(['purchase_head'], {
        title: 'New Development for Purchase',
        body:  message,
        url,
        tag:   `new-dev-purchase-${development_id}`,
      })

      const html = emailLayout(`
        ${greeting(head.full_name)}
        <p style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.6;">
          A new development has been forwarded to you by <strong>${merch_sender_name}</strong> (Merchandising) for procurement.
        </p>
        ${badge('New Development — Purchase', '#fce7f3', '#9d174d')}
        ${infoTable(
          infoRow('Title',            development_title)  +
          infoRow('From Design',      design_sender_name) +
          infoRow('Forwarded By',     merch_sender_name)
        )}
        ${purchase_remarks ? `
          <div style="margin-top:20px;background:#fdf2f8;border-left:3px solid #db2777;border-radius:4px;padding:12px 16px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#db2777;">Remarks from Merchandising</p>
            <p style="margin:0;font-size:14px;color:#1e293b;line-height:1.6;">${purchase_remarks}</p>
          </div>` : ''}
        ${design_remarks ? `
          <div style="margin-top:12px;background:#f8fafc;border-left:3px solid #94a3b8;border-radius:4px;padding:12px 16px;">
            <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;">Original Remarks from Design</p>
            <p style="margin:0;font-size:14px;color:#1e293b;line-height:1.6;">${design_remarks}</p>
          </div>` : ''}
        ${divider()}
        <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#0f172a;">Attached Files</p>
        ${allFileLinks || '<p style="font-size:13px;color:#94a3b8;">No files attached.</p>'}
        ${btn('View in App', url)}
      `)

      await sendEmail(head.email, `New Development for Purchase: "${development_title}"`, html)
    })
  )

  return NextResponse.json({ ok: true })
}

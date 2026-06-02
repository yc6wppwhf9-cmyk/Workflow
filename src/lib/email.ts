const APP_URL  = process.env.NEXT_PUBLIC_APP_URL  || 'https://workflow.hscvpl.in'
const FROM     = process.env.RESEND_FROM_EMAIL    || 'PLM System <noreply@hscvpl.in>'
const API_KEY  = () => process.env.RESEND_API_KEY

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ─── Layout ────────────────────────────────────────────────────────────────

export function emailLayout(content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:580px;margin:40px auto 24px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e3a8a 0%,#1d4ed8 100%);padding:28px 36px;display:flex;align-items:center;gap:16px;">
      <img src="${APP_URL}/logo.png" width="52" height="52"
           style="border-radius:10px;background:#fff;padding:4px;object-fit:contain;" />
      <div>
        <div style="color:#ffffff;font-size:17px;font-weight:700;letter-spacing:0.01em;">High Spirit Commercial Ventures</div>
        <div style="color:#93c5fd;font-size:12px;margin-top:3px;letter-spacing:0.05em;text-transform:uppercase;">Product Lifecycle Management</div>
      </div>
    </div>

    <!-- Body -->
    <div style="padding:36px;">
      ${content}
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 36px;">
      <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
        HSCVPL PLM · <a href="${APP_URL}" style="color:#60a5fa;text-decoration:none;">${APP_URL.replace('https://', '')}</a>
      </p>
      <p style="margin:4px 0 0;color:#cbd5e1;font-size:11px;">Automated notification — please do not reply to this email.</p>
    </div>
  </div>
</body>
</html>`
}

// ─── Reusable blocks ────────────────────────────────────────────────────────

export function btn(label: string, url: string): string {
  return `<a href="${url}" style="display:inline-block;margin-top:24px;background:#2563eb;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 28px;border-radius:8px;letter-spacing:0.01em;">${label} →</a>`
}

export function badge(text: string, color = '#dbeafe', textColor = '#1e40af'): string {
  return `<span style="display:inline-block;background:${color};color:${textColor};font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;letter-spacing:0.04em;text-transform:uppercase;">${text}</span>`
}

export function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:8px 0;color:#64748b;font-size:13px;width:140px;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:8px 0;color:#0f172a;font-size:13px;font-weight:500;">${escapeHtml(value)}</td>
  </tr>`
}

export function infoTable(rows: string): string {
  return `<table style="width:100%;border-collapse:collapse;margin-top:20px;background:#f8fafc;border-radius:8px;padding:4px 16px;display:table;">
    <tbody>${rows}</tbody>
  </table>`
}

export function greeting(name: string): string {
  return `<p style="margin:0 0 20px;color:#0f172a;font-size:15px;">Hi <strong>${escapeHtml(name)}</strong>,</p>`
}

export function divider(): string {
  return `<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />`
}

// ─── Send ────────────────────────────────────────────────────────────────────

export async function sendEmail(
  to: string | string[],
  subject: string,
  html: string,
  attachments?: { filename: string; content: string }[]
): Promise<boolean> {
  const key = API_KEY()
  if (!key) {
    console.log('[email] RESEND_API_KEY not set — skipping:', subject)
    return false
  }
  try {
    const body: Record<string, unknown> = {
      from: FROM,
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }
    if (attachments?.length) body.attachments = attachments
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) console.error('[email] Resend error:', await res.text())
    return res.ok
  } catch (err) {
    console.error('[email] Send failed:', err)
    return false
  }
}

export { APP_URL }

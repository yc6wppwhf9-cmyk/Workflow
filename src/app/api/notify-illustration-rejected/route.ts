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
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { product_id, file_id, file_name, feedback } = await request.json() as {
      product_id: string
      file_id: string
      file_name: string
      feedback?: string
    }

    const [fileRes, productRes, reviewerRes] = await Promise.all([
      adminSupabase
        .from('product_files')
        .select('uploaded_by, uploader:profiles!uploaded_by(full_name, email)')
        .eq('id', file_id)
        .single(),
      adminSupabase.from('products').select('name').eq('id', product_id).single(),
      adminSupabase.from('profiles').select('full_name').eq('id', user.id).single(),
    ])

    if (!fileRes.data || !productRes.data) return NextResponse.json({ skipped: true })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploader     = Array.isArray(fileRes.data.uploader) ? fileRes.data.uploader[0] : fileRes.data.uploader as any
    const uploaderId   = fileRes.data.uploaded_by
    const uploaderEmail = uploader?.email as string | undefined
    const uploaderName  = uploader?.full_name as string || 'Designer'
    const productName   = productRes.data.name
    const reviewerName  = reviewerRes.data?.full_name || 'Reviewer'
    const productUrl    = `${APP_URL}/products/${product_id}?tab=design`

    const notifMsg = `Your illustration "${file_name}" for "${productName}" was rejected by ${reviewerName}${feedback ? `: ${feedback}` : '.'}`

    // In-app notification
    await adminSupabase.from('notifications').insert({
      user_id:      uploaderId,
      product_id,
      product_name: productName,
      message:      notifMsg,
    })

    // Push notification
    await sendPushToUser(uploaderId, {
      title: 'Illustration Rejected',
      body:  notifMsg,
      url:   productUrl,
      tag:   `illo-rejected-${product_id}`,
    })

    // Email
    if (uploaderEmail) {
      const html = emailLayout(`
        ${greeting(uploaderName)}
        <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
          Your illustration has been reviewed by <strong>${reviewerName}</strong>.
        </p>
        ${badge('Rejected', '#fee2e2', '#b91c1c')}
        ${infoTable(
          infoRow('Product',     productName) +
          infoRow('File',        file_name) +
          infoRow('Reviewed by', reviewerName) +
          (feedback ? infoRow('Feedback', feedback) : '')
        )}
        ${divider()}
        <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;">
          Please review the feedback, update the illustration, and re-upload.
        </p>
        ${btn('Open Product', productUrl)}
      `)

      await sendEmail(
        uploaderEmail,
        `Illustration Rejected: "${productName}"`,
        html,
      )
    }

    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('[notify-illustration-rejected]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

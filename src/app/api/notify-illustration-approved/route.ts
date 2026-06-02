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

    // Fetch the uploader (designer) of this specific file
    const { data: file } = await adminSupabase
      .from('product_files')
      .select('uploaded_by, uploader:profiles!uploaded_by(full_name, email)')
      .eq('id', file_id)
      .single()

    // Fetch product name
    const { data: product } = await adminSupabase
      .from('products')
      .select('name')
      .eq('id', product_id)
      .single()

    // Fetch reviewer name
    const { data: reviewer } = await adminSupabase
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single()

    if (!file || !product) return NextResponse.json({ skipped: true })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploader = Array.isArray(file.uploader) ? file.uploader[0] : file.uploader as any
    const designerEmail = uploader?.email as string | undefined
    const designerName  = uploader?.full_name as string || 'Designer'
    const designerId    = file.uploaded_by
    const productName   = product.name
    const productUrl    = `${APP_URL}/products/${product_id}?tab=design`
    const reviewerName  = reviewer?.full_name || 'Design Head'

    const notifMsg = `Your illustration "${file_name}" for "${productName}" has been approved by ${reviewerName}.`

    // In-app notification
    await adminSupabase.from('notifications').insert({
      user_id:      designerId,
      product_id,
      product_name: productName,
      message:      notifMsg,
    })

    // Push notification
    await sendPushToUser(designerId, {
      title: '✅ Illustration Approved',
      body:  notifMsg,
      url:   productUrl,
      tag:   `illo-approved-${product_id}`,
    })

    // Email
    if (designerEmail) {
      const html = emailLayout(`
        ${greeting(designerName)}
        <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
          Your illustration has been reviewed by <strong>${reviewerName}</strong>.
        </p>
        ${badge('Approved', '#dcfce7', '#15803d')}
        ${infoTable(
          infoRow('Product',     productName) +
          infoRow('File',        file_name) +
          infoRow('Reviewed by', reviewerName) +
          (feedback ? infoRow('Note', feedback) : '')
        )}
        ${divider()}
        <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;">
          Keep up the great work! Once all illustrations are approved you can proceed to upload the <strong>tech pack</strong>.
        </p>
        ${btn('Open Product', productUrl)}
      `)

      await sendEmail(
        designerEmail,
        `Illustration Approved: "${productName}"`,
        html,
      )
    }

    return NextResponse.json({ sent: true })
  } catch (err) {
    console.error('[notify-illustration-approved]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

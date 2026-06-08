import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendEmail, emailLayout, greeting, btn, badge, infoTable, infoRow, APP_URL } from '@/lib/email'
import { sendPushToRole } from '@/lib/push'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData  = await req.formData()
  const file      = formData.get('file')         as File   | null
  const productId = formData.get('product_id')   as string | null
  const productName = formData.get('product_name') as string | null

  if (!file || !productId || !productName) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const [uploaderRes, designHeadsRes] = await Promise.all([
    adminSupabase.from('profiles').select('full_name').eq('id', user.id).single(),
    // Only notify design_head on upload. Sampling & merchandising_head are notified when "Send for Sampling" is pressed.
    adminSupabase.from('profiles').select('id, email, full_name, role').eq('role', 'design_head').eq('is_active', true),
  ])

  const uploaderName = uploaderRes.data?.full_name ?? 'A designer'
  const designHeads  = designHeadsRes.data ?? []

  // Save Excel to Supabase storage and record it in product_files
  const buffer      = Buffer.from(await file.arrayBuffer())
  const storagePath = `${productId}/techpack/${file.name}`

  await Promise.all([
    adminSupabase.storage.from('product-files').upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    }),
    adminSupabase.from('product_files').upsert({
      product_id:  productId,
      name:        file.name,
      file_url:    storagePath,
      file_type:   file.type,
      file_size:   file.size,
      department:  'design',
      uploaded_by: user.id,
    }, { onConflict: 'product_id,name,department' }),
  ])

  if (designHeads.length === 0) return NextResponse.json({ ok: true, skipped: 'no design heads' })

  const productUrl  = `${APP_URL}/products/${productId}?tab=design`
  const base64File  = buffer.toString('base64')
  const attachments = [{ filename: file.name, content: base64File }]

  // In-app + push
  await Promise.all([
    adminSupabase.from('notifications').insert(
      designHeads.map(dh => ({
        user_id:      dh.id,
        product_id:   productId,
        product_name: productName,
        message:      `${uploaderName} uploaded a tech pack for "${productName}". The Excel is attached to this email.`,
      }))
    ),
    sendPushToRole(['design_head'], {
      title: 'Tech Pack Uploaded',
      body:  `${uploaderName} uploaded a tech pack for "${productName}"`,
      url:   productUrl,
      tag:   `techpack-${productId}`,
    }),
  ])

  // Email with Excel attached
  await Promise.allSettled(
    designHeads.map(dh => {
      const html = emailLayout(`
        ${greeting(dh.full_name)}
        <p style="margin:0 0 8px;color:#334155;font-size:15px;line-height:1.6;">
          <strong>${uploaderName}</strong> has uploaded a tech pack Excel for the product below.
          The file is attached to this email.
        </p>
        ${badge('Tech Pack Upload', '#ede9fe', '#5b21b6')}
        ${infoTable(
          infoRow('Product',     productName) +
          infoRow('Uploaded by', uploaderName) +
          infoRow('File',        file.name)
        )}
        ${btn('Open Design Tab', productUrl)}
      `)
      return sendEmail(
        dh.email,
        `Tech Pack Uploaded: "${productName}" by ${uploaderName}`,
        html,
        attachments,
      )
    })
  )

  return NextResponse.json({ ok: true })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, emailLayout, greeting, badge, infoTable, infoRow, divider, btn, APP_URL } from '@/lib/email'
import { sendPushToUser } from '@/lib/push'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { product_id, variant_color, variant_idx, sampler_name, image_count } = await req.json()
  if (!product_id) return NextResponse.json({ error: 'Missing product_id' }, { status: 400 })

  const [{ data: product }, { data: designData }] = await Promise.all([
    adminSupabase.from('products').select('name').eq('id', product_id).single(),
    adminSupabase.from('design_data')
      .select('assigned_to, designer:profiles!assigned_to(id, full_name, email)')
      .eq('product_id', product_id)
      .single(),
  ])

  const productName = product?.name || 'Product'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const designer = Array.isArray(designData?.designer) ? (designData.designer as any[])[0] : designData?.designer as any

  if (!designer?.id || !designer?.email) {
    return NextResponse.json({ ok: true, skipped: 'no designer assigned' })
  }

  const variantLabel = variant_color || (variant_idx != null ? `Variant ${variant_idx + 1}` : 'all variants')
  const productUrl = `${APP_URL}/products/${product_id}?tab=sampling`
  const count = image_count ?? 1
  const message = `${count} sample image${count !== 1 ? 's' : ''} uploaded for "${productName}" — ${variantLabel}`

  await adminSupabase.from('notifications').insert({
    user_id: designer.id,
    product_id,
    product_name: productName,
    message,
  })

  await sendPushToUser(designer.id, {
    title: '📸 Sample Photos Uploaded',
    body: message,
    url: productUrl,
    tag: `sample-upload-${product_id}`,
  })

  const html = emailLayout(`
    ${greeting(designer.full_name)}
    <p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.6;">
      The sampling team has uploaded physical sample photos for your product.
    </p>
    ${badge('Sample Photos Ready', '#ede9fe', '#5b21b6')}
    ${infoTable(
      infoRow('Product',      productName) +
      infoRow('Colour / Variant', variantLabel) +
      infoRow('Images uploaded', String(count)) +
      (sampler_name ? infoRow('Uploaded by', sampler_name) : '')
    )}
    ${divider()}
    <p style="margin:0;color:#475569;font-size:14px;line-height:1.7;">
      Open the Sampling tab to review the uploaded sample photos for this colour variant.
    </p>
    ${btn('View Sampling Tab', productUrl)}
  `)

  await sendEmail(designer.email, `Sample Photos Uploaded — ${productName} (${variantLabel})`, html)

  return NextResponse.json({ ok: true })
}

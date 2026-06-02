import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendPushToRole } from '@/lib/push'
import { APP_URL } from '@/lib/email'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'design') {
      return NextResponse.json({ error: 'Only design team members can submit for review' }, { status: 403 })
    }

    const { product_id } = await request.json() as { product_id: string }
    if (!product_id) return NextResponse.json({ error: 'product_id is required' }, { status: 400 })

    const { data, error } = await supabase
      .from('design_submissions')
      .insert({ product_id, submitted_by: user.id, status: 'pending' })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Mark all unreviewed design images as pending
    await supabase
      .from('product_files')
      .update({ review_status: 'pending' })
      .eq('product_id', product_id)
      .eq('department', 'design')
      .is('review_status', null)
      .like('file_type', 'image/%')

    await supabase.from('activity_logs').insert({
      product_id,
      user_id: user.id,
      action: 'submitted design illustrations for review',
      department: 'design',
    })

    // Notify all active design heads
    const [{ data: product }, { data: submitter }, { data: designHeads }] = await Promise.all([
      adminSupabase.from('products').select('name').eq('id', product_id).single(),
      adminSupabase.from('profiles').select('full_name').eq('id', user.id).single(),
      adminSupabase.from('profiles').select('id').eq('role', 'design_head').eq('is_active', true),
    ])

    if (product && designHeads && designHeads.length > 0) {
      const submitterName = submitter?.full_name ?? 'A designer'
      const message = `${submitterName} submitted illustrations for "${product.name}" — review needed.`
      const productUrl = `${APP_URL}/products/${product_id}?tab=design`

      await Promise.all([
        adminSupabase.from('notifications').insert(
          designHeads.map(dh => ({ user_id: dh.id, product_id, product_name: product.name, message }))
        ),
        sendPushToRole('design_head', {
          title: 'Design Submission — Review Needed',
          body: message,
          url: productUrl,
          tag: `submit-${product_id}`,
        }),
      ])
    }

    return NextResponse.json({ submission: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

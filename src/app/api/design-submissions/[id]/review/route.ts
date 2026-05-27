import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!['admin', 'design_head'].includes(profile?.role ?? '')) {
      return NextResponse.json({ error: 'Only design head or admin can review submissions' }, { status: 403 })
    }

    const { status, feedback } = await request.json() as {
      status: 'approved' | 'rejected'
      feedback?: string
    }
    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'status must be approved or rejected' }, { status: 400 })
    }

    // Fetch submission to get product_id for activity log
    const { data: submission } = await supabase
      .from('design_submissions')
      .select('product_id')
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
        user_id: user.id,
        action: `design submission ${status}${feedback ? `: ${feedback}` : ''}`,
        department: 'design',
      })
    }

    return NextResponse.json({ submission: data })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

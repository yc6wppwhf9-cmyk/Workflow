import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendPushToUser } from '@/lib/push'
import { APP_URL } from '@/lib/email'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Delete an addition-work item — RLS restricts this to the uploader (or admin).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // addition_work isn't in the generated DB types yet — cast like new_developments.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('addition_work').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// BOM team fills in the updated INV code(s) + note. RLS restricts UPDATE to bom/admin.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles').select('role, full_name').eq('id', user.id).single()
  if (!['bom', 'admin'].includes(profile?.role ?? '')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { inv_codes, inv_note } = await request.json() as { inv_codes: string; inv_note: string }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: item, error } = await (supabase as any)
    .from('addition_work')
    .update({
      inv_codes: inv_codes?.trim() || null,
      inv_note: inv_note?.trim() || null,
      inv_updated_by: user.id,
      inv_updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, name, uploaded_by, inv_codes, inv_note, inv_updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify the merch head who uploaded it — best-effort.
  if (item?.uploaded_by) {
    const message = `${profile?.full_name || 'BOM team'} updated the INV for "${item.name}"${item.inv_codes ? `: ${item.inv_codes}` : ''}`
    const url = `${APP_URL}/addition-work`
    await Promise.allSettled([
      adminSupabase.from('notifications').insert({ user_id: item.uploaded_by, message }),
      sendPushToUser(item.uploaded_by, { title: 'INV Updated', body: message, url, tag: `addition-work-inv-${id}` }),
    ])
  }

  return NextResponse.json({ ok: true, item })
}

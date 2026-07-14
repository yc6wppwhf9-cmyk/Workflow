import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { sendPushToRole } from '@/lib/push'
import { APP_URL } from '@/lib/email'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Merchandising head uploads an Excel sheet for the BOM team ("Addition Work").
// A row is stored and the BOM team is notified. Visibility is enforced by RLS
// (merch head + bom + admin only).
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('profiles').select('role, full_name').eq('id', user.id).single()
    if (!['merchandising_head', 'admin'].includes(profile?.role ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { name, file_url, file_type, file_size, remarks } = await request.json()
    if (!name || !file_url) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    // addition_work isn't in the generated DB types yet — cast like new_developments.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: item, error } = await (supabase as any)
      .from('addition_work')
      .insert({ name, file_url, file_type: file_type || null, file_size: file_size || null, remarks: remarks || null, uploaded_by: user.id })
      .select('id, name, file_url, file_type, file_size, remarks, inv_codes, inv_note, inv_updated_at, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Notify the BOM team — best-effort.
    const { data: bomUsers } = await adminSupabase
      .from('profiles').select('id').eq('role', 'bom').eq('is_active', true)
    const message = `${profile?.full_name || 'Merchandising'} shared addition work: ${name}`
    const url = `${APP_URL}/addition-work`
    await Promise.allSettled([
      bomUsers?.length
        ? adminSupabase.from('notifications').insert(bomUsers.map(b => ({ user_id: b.id, message })))
        : Promise.resolve(),
      sendPushToRole('bom', { title: 'New Addition Work', body: message, url, tag: `addition-work-${item.id}` }),
    ])

    return NextResponse.json({ ok: true, item })
  } catch (err) {
    console.error('[addition-work]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

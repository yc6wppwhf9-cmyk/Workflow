import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
import { cloudinary, getCloudinaryPublicId, isCloudinaryUrl } from '@/lib/cloudinary'

const adminSupabase = createAdmin(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Bulk-delete product_files (images) by id — used by the Colour tab's admin
// "Delete selected" action. Removes the stored asset + the DB rows.
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  const { ids } = await req.json() as { ids: string[] }
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 })
  }

  const { data: files } = await adminSupabase
    .from('product_files')
    .select('id, uploaded_by, file_url')
    .in('id', ids)

  if (!files || files.length === 0) return NextResponse.json({ ok: true, deleted: 0 })

  // Only admins, or the uploader of every selected file, may bulk-delete.
  const isAdmin = profile?.role === 'admin'
  const deletable = isAdmin ? files : files.filter(f => f.uploaded_by === user.id)
  if (deletable.length === 0) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Best-effort remove Cloudinary assets, then delete the rows in one query.
  await Promise.allSettled(
    deletable
      .filter(f => f.file_url && isCloudinaryUrl(f.file_url))
      .map(f => {
        const publicId = getCloudinaryPublicId(f.file_url)
        return publicId ? cloudinary.uploader.destroy(publicId) : Promise.resolve()
      }),
  )

  const deletableIds = deletable.map(f => f.id)
  const { error } = await adminSupabase.from('product_files').delete().in('id', deletableIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, deleted: deletableIds.length })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cloudinary, getCloudinaryPublicId, isCloudinaryUrl } from '@/lib/cloudinary'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { file_url, file_id } = await req.json() as { file_url: string; file_id: string }

  if (!file_id) return NextResponse.json({ error: 'file_id required' }, { status: 400 })

  // Verify ownership before deleting to prevent IDOR
  const [{ data: file }, { data: profile }] = await Promise.all([
    supabase.from('product_files').select('uploaded_by, file_url').eq('id', file_id).single(),
    supabase.from('profiles').select('role').eq('id', user.id).single(),
  ])

  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })
  if (file.uploaded_by !== user.id && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Delete from Cloudinary (only for Cloudinary-hosted files)
  const targetUrl = file_url || file.file_url
  if (targetUrl && isCloudinaryUrl(targetUrl)) {
    const publicId = getCloudinaryPublicId(targetUrl)
    if (publicId) {
      await cloudinary.uploader.destroy(publicId).catch(() => {})
    }
  }

  await supabase.from('product_files').delete().eq('id', file_id)

  return NextResponse.json({ ok: true })
}
